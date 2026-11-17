"""Pen-plotter G-code for a Bambu Lab A1 mini with a pen mounted on the toolhead.

The printer has no pen-up/pen-down command, so the pen is raised and lowered
with the Z axis. Everything here is cold: heaters and fan are switched off and
the extruder never moves.

The start and end sequences follow two community projects that run pen plots
on this printer from plain .gcode files:
    https://github.com/Hansolox80/a1-mini-pen-plotter      (MIT)
    https://github.com/LeanBread/Processing-BBLGCodePlot   (MIT)
This module has NOT been run on a real printer. Read the generated header and
do an air run (--air) before letting a pen touch anything.

Coordinates. A page is a list of strokes in millimetres with the origin at the
top-left corner and y pointing down the page. On the bed, X runs left to right
and Y from the front edge to the back, so the page's y axis is flipped. G-code
positions are for the NOZZLE; the pen tip sits at nozzle + pen_offset.
"""

import re
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw

BED_MM = 180.0


@dataclass
class Plotter:
    z_draw: float                 # nozzle height (mm) at which the pen tip just presses on the paper
    z_lift: float = 3.0           # how far to raise the pen between strokes
    z_clear: float = 15.0         # extra height for the first and last moves
    pen_offset: tuple = (0.0, 0.0)  # pen tip position relative to the nozzle, (x, y) mm
    margin: float = 10.0          # keep the pen at least this far inside the bed edges
    draw_speed: float = 30.0      # mm/s with the pen down
    travel_speed: float = 120.0   # mm/s with the pen up
    z_speed: float = 10.0         # mm/s
    settle_ms: int = 50           # wait after lowering the pen
    pause_for_pen: bool = True    # home with the pen out, then pause so it can be inserted

    @property
    def z_up(self):
        return self.z_draw + self.z_lift

    @property
    def z_safe(self):
        return self.z_draw + self.z_clear


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker: drop points that deviate less than `tolerance` from the path."""
    points = np.asarray(points, dtype=float)
    if len(points) < 3:
        return points
    keep = np.zeros(len(points), dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        start, chord = points[a], points[b] - points[a]
        rel = points[a + 1 : b] - start
        norm = np.hypot(*chord)
        if norm == 0:
            dist = np.hypot(rel[:, 0], rel[:, 1])
        else:
            dist = np.abs(chord[0] * rel[:, 1] - chord[1] * rel[:, 0]) / norm
        i = int(dist.argmax())
        if dist[i] > tolerance:
            keep[a + 1 + i] = True
            stack += [(a, a + 1 + i), (a + 1 + i, b)]
    return points[keep]


def place_on_bed(strokes, plotter, origin=None):
    """Page strokes (mm, y down) -> pen positions on the bed (mm, y towards the back).

    origin: bed position of the page's top-left corner. Default: centre the
    drawing in the area the pen is allowed to reach.
    """
    points = np.concatenate(strokes)
    lo, hi = points.min(axis=0), points.max(axis=0)
    size = hi - lo
    usable = BED_MM - 2 * plotter.margin
    if (size > usable).any():
        raise ValueError(
            f"drawing is {size[0]:.0f} x {size[1]:.0f} mm but only {usable:.0f} x {usable:.0f} mm "
            f"is usable; shorten the lines or reduce the writing size"
        )
    if origin is None:
        origin = (BED_MM / 2 - size[0] / 2 - lo[0], BED_MM / 2 + size[1] / 2 + lo[1])
    placed = [np.column_stack([origin[0] + s[:, 0], origin[1] - s[:, 1]]) for s in strokes]

    pen = np.concatenate(placed)
    nozzle = pen - np.asarray(plotter.pen_offset)
    if pen.min() < plotter.margin - 1e-6 or pen.max() > BED_MM - plotter.margin + 1e-6:
        raise ValueError("drawing leaves the usable area of the bed at this origin")
    if nozzle.min() < 0 or nozzle.max() > BED_MM:
        raise ValueError(
            "the pen offset puts the nozzle outside the bed for part of this drawing; "
            "move the drawing or increase the margin"
        )
    return placed


def to_gcode(strokes, plotter, origin=None, air=0.0, tolerance=0.03, title="handwriting"):
    """Strokes on a page (list of (N, 2) arrays, mm, y down) -> G-code text.

    air: raise every pen-down move by this many mm, for a dry run that should
    trace the drawing just above the paper.
    """
    strokes = [simplify(s, tolerance) for s in strokes if len(s)]
    placed = place_on_bed(strokes, plotter, origin)
    offset = np.asarray(plotter.pen_offset)
    z_draw, z_up, z_safe = plotter.z_draw + air, plotter.z_up + air, plotter.z_safe + air
    f_draw, f_travel, f_z = plotter.draw_speed * 60, plotter.travel_speed * 60, plotter.z_speed * 60

    pen = np.concatenate(placed)
    draw_mm = sum(np.hypot(*np.diff(s, axis=0).T).sum() for s in placed)
    travel_mm = sum(np.hypot(*(b[0] - a[-1])) for a, b in zip(placed, placed[1:]))
    seconds = (
        draw_mm / plotter.draw_speed
        + travel_mm / plotter.travel_speed
        + len(placed) * (2 * plotter.z_lift / plotter.z_speed + plotter.settle_ms / 1000)
    )

    out = [
        f"; {title}",
        "; Pen plot for a Bambu Lab A1 mini. Cold: no heating, no extrusion.",
        f"; strokes: {len(placed)}   pen-down: {draw_mm:.0f} mm   pen-up travel: {travel_mm:.0f} mm",
        f"; estimated time: {seconds / 60:.1f} min (ignores acceleration)",
        f"; pen area on bed: X {pen[:, 0].min():.1f}..{pen[:, 0].max():.1f}  Y {pen[:, 1].min():.1f}..{pen[:, 1].max():.1f}",
        f"; nozzle Z: draw {z_draw:.2f}  lifted {z_up:.2f}  clear {z_safe:.2f}"
        + (f"   AIR RUN: all heights raised {air:g} mm" if air else ""),
        f"; pen tip offset from nozzle: X {offset[0]:+.2f}  Y {offset[1]:+.2f}",
        ";",
        "; BEFORE RUNNING",
        "; - Homing lowers the NOZZLE onto the bed. A pen that reaches below the",
        ";   nozzle will hit first, so the pen must be out (or raised) while homing.",
        "; - z_draw must be calibrated for this pen and holder. First run with --air.",
        "; - Unload filament. Tape the paper flat; no clips where the toolhead travels.",
        ";",
        "M220 S100 ; speed override 100%",
        "G21 ; millimetres",
        "G90 ; absolute positioning",
        "M83 ; relative extruder (never used)",
        "M104 S0 ; hotend off",
        "M140 S0 ; bed off",
        "M106 S0 ; fan off",
        "G28 ; home all axes (nozzle touches the bed)",
        f"G1 Z{z_safe:.2f} F{f_z:.0f} ; raise clear",
    ]
    if plotter.pause_for_pen:
        out += [
            f"G0 X{BED_MM / 2:.1f} Y{BED_MM - 10:.1f} F{f_travel:.0f} ; bring the toolhead forward",
            "M400 ; finish moves",
            "M400 U1 ; PAUSE: insert the pen, then press resume on the printer",
        ]
    out.append("")

    for stroke in placed:
        nozzle = stroke - offset
        out.append(f"G0 X{nozzle[0, 0]:.2f} Y{nozzle[0, 1]:.2f} F{f_travel:.0f}")
        out.append(f"G1 Z{z_draw:.2f} F{f_z:.0f}")
        if plotter.settle_ms:
            out.append(f"G4 P{plotter.settle_ms}")
        for i, (x, y) in enumerate(nozzle[1:]):   # a one-point stroke is a dot: touch and lift
            out.append(f"G1 X{x:.2f} Y{y:.2f}" + (f" F{f_draw:.0f}" if i == 0 else ""))
        out.append(f"G1 Z{z_up:.2f} F{f_z:.0f}")

    out += [
        "",
        f"G1 Z{z_safe:.2f} F{f_z:.0f} ; raise clear",
        f"G0 X10.0 Y{BED_MM - 10:.1f} F{f_travel:.0f} ; push the bed forward to present the page",
        "M400 ; finish moves",
        "M84 ; motors off",
        "",
    ]
    return "\n".join(out)


def read_back(gcode, pen_offset=(0.0, 0.0)):
    """Interpret G-code as the printer would and return what the pen draws.

    Returns (strokes, z_values): pen-tip polylines for every run of XY moves
    made at the lowest Z in the file, and the set of Z heights used. This is an
    independent check on to_gcode: it knows only G0/G1/G90 semantics.
    """
    moves, position = [], {"X": None, "Y": None, "Z": None}
    for line in gcode.splitlines():
        code = line.split(";")[0].strip()
        if not re.match(r"G[01]\b", code):
            continue
        before = dict(position)
        for axis, value in re.findall(r"([XYZ])(-?\d+\.?\d*)", code):
            position[axis] = float(value)
        moves.append((before, dict(position)))

    z_values = sorted({m[1]["Z"] for m in moves if m[1]["Z"] is not None})
    z_down = z_values[0]
    offset = np.asarray(pen_offset)
    strokes, current = [], None
    for before, after in moves:
        xy_move = (before["X"], before["Y"]) != (after["X"], after["Y"])
        if after["Z"] == z_down and before["Z"] == z_down and xy_move:
            if current is None:
                current = [np.array([before["X"], before["Y"]]) + offset]
            current.append(np.array([after["X"], after["Y"]]) + offset)
        elif after["Z"] == z_down and before["Z"] != z_down:
            current = [np.array([after["X"], after["Y"]]) + offset]   # pen just landed
        elif after["Z"] != z_down and current is not None:
            strokes.append(np.array(current))
            current = None
    return strokes, z_values


def preview(strokes, pen_width_mm=0.5, pixels_per_mm=8, crop=True, pad_mm=5.0):
    """Render pen strokes given in bed coordinates, as seen from above (front of bed at the bottom)."""
    points = np.concatenate(strokes)
    if crop:
        lo, hi = points.min(axis=0) - pad_mm, points.max(axis=0) + pad_mm
    else:
        lo, hi = np.zeros(2), np.full(2, BED_MM)
    k = pixels_per_mm
    size = np.ceil((hi - lo) * k).astype(int)
    image = Image.new("L", (int(size[0]), int(size[1])), 255)
    draw = ImageDraw.Draw(image)
    w = max(1, round(pen_width_mm * k))
    for s in strokes:
        pts = [((x - lo[0]) * k, (hi[1] - y) * k) for x, y in s]
        if len(pts) > 1:
            draw.line(pts, fill=30, width=w, joint="curve")
        for x, y in (pts[0], pts[-1]):
            draw.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=30)
    return image


def write(path, strokes, plotter, air=0.0, title="handwriting"):
    """Write G-code for page strokes (mm), plus a picture of what that G-code draws."""
    text = to_gcode(strokes, plotter, air=air, title=title)
    with open(path, "w") as f:
        f.write(text)
    drawn, _ = read_back(text, plotter.pen_offset)
    preview_path = path.rsplit(".", 1)[0] + "_preview.png"
    preview(drawn).save(preview_path)
    print(f"wrote {path} and {preview_path}")
    for line in text.splitlines()[2:6]:
        print("  " + line.lstrip("; "))


def add_arguments(parser):
    """Command-line options shared by the tools that can write G-code."""
    group = parser.add_argument_group("pen plotter (Bambu Lab A1 mini)")
    group.add_argument("--gcode", metavar="FILE", help="also write G-code for the pen plotter")
    group.add_argument("--z-draw", type=float, metavar="MM",
                       help="nozzle height at which the pen touches the paper; required with --gcode, "
                            "measured on your printer")
    group.add_argument("--pen-offset", type=float, nargs=2, default=(0.0, 0.0), metavar=("X", "Y"),
                       help="pen tip position relative to the nozzle, mm")
    group.add_argument("--line-pitch", type=float, default=8.0, metavar="MM",
                       help="distance from one line of writing to the next (ruled paper is 7-9 mm)")
    group.add_argument("--z-lift", type=float, default=3.0, metavar="MM")
    group.add_argument("--draw-speed", type=float, default=30.0, metavar="MM/S")
    group.add_argument("--air", type=float, default=0.0, metavar="MM",
                       help="dry run: trace everything this far above the paper")
    group.add_argument("--no-pen-pause", action="store_true",
                       help="do not pause after homing to insert the pen (only if the pen cannot touch the bed while homing)")


def plotter_from_arguments(parser, args):
    if args.z_draw is None:
        parser.error("--gcode needs --z-draw: the nozzle height at which your pen touches the paper")
    return Plotter(z_draw=args.z_draw, z_lift=args.z_lift, pen_offset=tuple(args.pen_offset),
                   draw_speed=args.draw_speed, pause_for_pen=not args.no_pen_pause)
