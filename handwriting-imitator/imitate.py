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

from hwsynth import gcode
from hwsynth.eruku import LINE_HEIGHT, Eruku
from hwsynth.preprocess import clean_line
from hwsynth.vectorize import centerlines

MARGIN = 40          # pixels of white around the page
PITCH = 0.85         # line spacing as a fraction of the 64 px line height
PARAGRAPH_GAP = 0.6  # extra spacing between paragraphs, in lines


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


def place_lines(lines):
    """Yield (line image, y of its top edge on the page); None entries are paragraph breaks."""
    step = round(LINE_HEIGHT * PITCH)
    y = MARGIN
    for im in lines:
        if im is None:
            y += round(step * PARAGRAPH_GAP)
        else:
            yield im, y
            y += step


def compose_page(lines):
    """Stack line images on a white page."""
    placed = list(place_lines(lines))
    width = max(im.width for im, _ in placed) + 2 * MARGIN
    page = np.full((placed[-1][1] + LINE_HEIGHT + MARGIN, width), 255, dtype=np.uint8)
    for im, y in placed:
        # Darkest-pixel-wins, so a line's white box cannot erase its neighbour's descenders.
        region = page[y : y + LINE_HEIGHT, MARGIN : MARGIN + im.width]
        np.minimum(region, np.asarray(im), out=region)
    return Image.fromarray(page, mode="L")


def page_strokes(lines, line_pitch_mm):
    """Trace every line's ink into pen paths, laid out like compose_page, in millimetres."""
    mm_per_pixel = line_pitch_mm / round(LINE_HEIGHT * PITCH)
    return [(path + [MARGIN, y]) * mm_per_pixel for im, y in place_lines(lines) for path in centerlines(im)]


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
    gcode.add_arguments(parser)
    args = parser.parse_args()
    plotter = gcode.plotter_from_arguments(parser, args) if args.gcode else None

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
    if plotter:
        gcode.write(args.gcode, page_strokes(lines, args.line_pitch), plotter, args.air, title=text.strip()[:60])


if __name__ == "__main__":
    main()
