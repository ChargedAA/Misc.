"""Text -> handwriting as vector pen strokes (SVG + PNG).

    python write_strokes.py --checkpoint path/to/Epoch_52 --out page \
        "First line of text" "Second line of text"

Every line is primed with the same seed sample, so the whole page is written
in one consistent hand. Change --style-seed to get a different hand.
"""

import argparse

import torch

from hwsynth import gcode
from hwsynth.graves import Handwriter
from hwsynth.render import LINE_PITCH, layout_lines, to_png, to_polylines, to_svg

PRIME_TEXT = "a quick brown fox jumps"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("lines", nargs="+", help="lines of text to write")
    parser.add_argument("--checkpoint", required=True, help="directory with model.pt and meta.json")
    parser.add_argument("--out", default="handwriting", help="output path without extension")
    parser.add_argument("--bias", type=float, default=1.0, help="0 = messy and varied, 1+ = neat")
    parser.add_argument("--style-seed", type=int, default=0, help="picks the hand the page is written in")
    parser.add_argument("--no-prime", action="store_true", help="let every line pick its own style")
    gcode.add_arguments(parser)
    args = parser.parse_args()
    plotter = gcode.plotter_from_arguments(parser, args) if args.gcode else None

    torch.set_num_threads(1)  # the network is tiny; extra threads only add overhead
    writer = Handwriter.load(args.checkpoint)
    for line in args.lines:
        if bad := writer.unsupported(line):
            parser.error(f"characters not in the model's alphabet: {''.join(bad)!r}")

    prime = None
    if not args.no_prime:
        # The style reference here is itself sampled from the model. To imitate
        # a real person, replace it with their recorded strokes + transcript.
        prime_strokes, ok = writer.write(PRIME_TEXT, bias=args.bias, seed=args.style_seed)
        if not ok:
            parser.error("could not draw a style sample for this --style-seed; try another")
        prime = (prime_strokes, PRIME_TEXT)

    samples = []
    for i, line in enumerate(args.lines):
        sample, ok = writer.write(line, bias=args.bias, prime=prime, seed=args.style_seed * 1000 + i + 1)
        print(f"{line!r}: {len(sample)} pen points" + ("" if ok else "  [WARNING: sampler derailed, line is unreliable]"))
        samples.append(sample)

    polylines, width, height = layout_lines([to_polylines(s) for s in samples])
    with open(args.out + ".svg", "w") as f:
        f.write(to_svg(polylines, width, height))
    to_png(polylines, width, height).save(args.out + ".png")
    torch.save({"lines": args.lines, "strokes": samples}, args.out + ".pt")
    print(f"wrote {args.out}.svg, {args.out}.png, {args.out}.pt")

    if plotter:
        mm_per_unit = args.line_pitch / LINE_PITCH
        gcode.write(args.gcode, [p * mm_per_unit for p in polylines], plotter, args.air, title=" / ".join(args.lines))


if __name__ == "__main__":
    main()
