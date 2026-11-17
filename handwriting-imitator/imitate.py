"""Write text in the handwriting shown in a reference image.

    python imitate.py --style my_line.jpg --style-text "what that line says" \
        --out page.png "The text you want written out by hand."

The reference should be ONE line of handwriting, dark ink on plain paper.
Long text is wrapped into lines, each generated separately from the same
reference, then stacked into a page. Blank lines in --text-file start a new
paragraph.
"""

import argparse
import textwrap

import numpy as np
from PIL import Image

from hwsynth.eruku import LINE_HEIGHT, Eruku
from hwsynth.preprocess import clean_line


def wrap_balanced(paragraph, max_chars):
    """Wrap to at most max_chars per line, evening the lines out.

    Plain wrapping can leave one or two words alone on the last line, and the
    model draws very short lines badly (heavy, smeared strokes).
    """
    text = " ".join(paragraph.split())
    lines = textwrap.wrap(text, max_chars)
    for width in range(max(len(w) for w in text.split()), max_chars):
        narrower = textwrap.wrap(text, width)
        if len(narrower) == len(lines):
            return narrower
    return lines


def compose_page(lines, margin=40, pitch=0.85, paragraph_gap=0.6):
    """Stack line images (None = paragraph break) on a white page."""
    step = round(LINE_HEIGHT * pitch)
    width = max(im.width for im in lines if im is not None) + 2 * margin
    height = 2 * margin + LINE_HEIGHT + sum(step if im is not None else round(step * paragraph_gap) for im in lines)
    page = np.full((height, width), 255, dtype=np.uint8)
    y = margin
    for im in lines:
        if im is None:
            y += round(step * paragraph_gap)
            continue
        # Darkest-pixel-wins, so a line's white box cannot erase its neighbour's descenders.
        region = page[y : y + LINE_HEIGHT, margin : margin + im.width]
        np.minimum(region, np.asarray(im), out=region)
        y += step
    return Image.fromarray(page[: y + LINE_HEIGHT - step + margin], mode="L")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("text", nargs="?", help="text to write (or use --text-file)")
    parser.add_argument("--text-file", help="read the text from a file instead")
    parser.add_argument("--style", required=True, help="image of one line of the handwriting to imitate")
    parser.add_argument("--style-text", default="", help="transcript of the style image (recommended)")
    parser.add_argument("--out", default="handwriting.png")
    parser.add_argument("--chars-per-line", type=int, default=42)
    parser.add_argument("--guidance", type=float, default=1.25,
                        help="how hard to push towards the requested text; 1.0 = off and twice as fast, above 1.5 distorts")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--no-clean", action="store_true", help="skip background removal and cropping of the style image")
    args = parser.parse_args()

    if (args.text is None) == (args.text_file is None):
        parser.error("give the text either as an argument or with --text-file")
    text = args.text if args.text is not None else open(args.text_file).read()

    style = Image.open(args.style)
    if not args.no_clean:
        style = clean_line(style)

    model = Eruku.from_pretrained()
    lines = []
    for paragraph in text.strip().split("\n\n"):
        if lines:
            lines.append(None)
        for line in wrap_balanced(paragraph, args.chars_per_line):
            image, ok = model.write(style, line, args.style_text, args.guidance, seed=args.seed + len(lines))
            lines.append(image)
            print(f"{line!r} -> {image.width}px" + ("" if ok else "  [WARNING: generation ran away, line is unreliable]"))

    compose_page(lines).save(args.out)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
