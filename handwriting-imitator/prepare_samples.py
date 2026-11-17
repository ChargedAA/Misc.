"""Turn a photo of a handwritten page into a set of line samples.

    python prepare_samples.py --page page.jpg --text page.txt --out my_handwriting

page.txt says what the page says, one line of the file per handwritten line.
The output folder gets one image per line plus metadata.jsonl listing each
image with its text. imitate.py --style-dir reads that folder, and the same
layout is what a fine-tuning run would take as its dataset.

Run it again with another page and the same --out to add more lines.

For a good result: dark pen on plain unlined paper, lines well separated, the
photo taken square-on in even light and cropped to the paper.
"""

import argparse
import json
import os

from PIL import Image

from hwsynth.preprocess import split_page

INDEX = "metadata.jsonl"


def load_samples(folder):
    """[(image, text)] for a folder written by this tool."""
    with open(os.path.join(folder, INDEX)) as f:
        entries = [json.loads(line) for line in f if line.strip()]
    return [(Image.open(os.path.join(folder, e["file_name"])).convert("L"), e["text"]) for e in entries]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--page", required=True, help="photo or scan of the handwritten page")
    parser.add_argument("--text", required=True, help="text file with what each handwritten line says")
    parser.add_argument("--out", default="my_handwriting")
    args = parser.parse_args()

    with open(args.text) as f:
        texts = [line.strip() for line in f if line.strip()]
    lines, overlay = split_page(Image.open(args.page))

    os.makedirs(args.out, exist_ok=True)
    stem = os.path.splitext(os.path.basename(args.page))[0]
    check = os.path.join(args.out, f"{stem}_detected.png")
    overlay.save(check)
    if len(lines) != len(texts):
        parser.error(
            f"found {len(lines)} handwritten lines but {args.text} has {len(texts)} lines of text. "
            f"Open {check} to see what was detected; nothing was added to {args.out}."
        )

    index = os.path.join(args.out, INDEX)
    existing = sum(1 for line in open(index) if line.strip()) if os.path.exists(index) else 0
    with open(index, "a") as f:
        for n, (image, text) in enumerate(zip(lines, texts), start=existing + 1):
            name = f"line_{n:03d}.png"
            image.save(os.path.join(args.out, name))
            f.write(json.dumps({"file_name": name, "text": text}) + "\n")
            print(f"{name}  {image.width}x{image.height}  {text}")
    print(f"{len(lines)} lines added, {existing + len(lines)} in {args.out}. Check {check} against the page.")


if __name__ == "__main__":
    main()
