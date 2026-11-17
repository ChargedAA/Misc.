"""Floating pen / pencil holder for the Bambu Lab A1 mini.

    python pen_mount.py --out build --pen-diameter 10

Three printed parts:

  saddle   sits on the printer's own clip-on front cover: lips on the top and
           both sides locate it, two pads take double-sided foam tape, and the
           middle is relieved so it clears the lens dome. A dovetail rail runs
           down its front.
  carrier  slides on the rail and grips the pen in a split ring closed by one
           M3 screw. It hangs from the top of the rail by its own weight.
  gauge    sets how far the pen tip hangs below the saddle, so every pen is
           loaded to the same height.

The pen is not pressed onto the paper by the printer. When the toolhead comes
down the tip lands first, the carrier stops, and the rail carries on a few
millimetres. The pen then rests on the paper under its own weight (plus a
rubber band if more pressure is wanted). So the drawing height only has to be
"somewhere inside the float travel", a pencil that wears down keeps touching,
and nothing rigid is driven into the bed if a height is wrong.

Because the saddle is fixed to the cover and the cover unclips, the whole pen
assembly comes off the printer in one piece for homing.

Dimensions are millimetres. Axes: X across the toolhead, Z up, and Y towards
the printer, with Y = 0 on the front face of the cover (the pen is at -Y).

Measured on the owner's A1 mini: cover width 53.21, cover rim depth 3.93.
Estimated from photos and still to be confirmed: cover height, lens position
and how far the lens dome stands proud. Print the saddle alone first to check.
"""

import argparse
import math
import os
from dataclasses import dataclass

import cadquery as cq


@dataclass
class Design:
    # The printer's front cover
    cover_width: float = 53.2          # measured
    cover_grip: float = 3.0            # how far the lips reach back along the cover's 3.93 deep rim
    lens_clearance: float = 5.0        # ESTIMATE: must exceed how far the lens dome stands proud
    fit: float = 0.3                   # gap per side between lips and cover

    # Saddle
    saddle_height: float = 68.0        # top edge sits level with the top of the cover
    pad_top: float = 20.0              # height of the upper tape pad
    pad_bottom: float = 15.0           # height of the lower tape pad
    lip_start: float = 20.0            # side lips stop this far above the bottom, clear of the fan grille
    plate: float = 3.0
    wall: float = 2.0

    # Dovetail rail (60 degree flanks, prints without support with the saddle on its back)
    rail_base: float = 8.0
    rail_top: float = 14.0
    clearance: float = 0.25            # gap per side between rail and carrier; tune with the fit test

    # Carrier
    pen_diameter: float = 10.0
    bore_fit: float = 0.4              # bore is this much larger than the pen before the screw closes it
    ring_wall: float = 3.0
    carrier_width: float = 22.0
    carrier_height: float = 40.0
    cap: float = 3.0                   # closed top of the slot; this is what rests on the rail
    float_travel: float = 12.0

    # Gauge
    tip_drop: float = 28.0             # ESTIMATE: tip this far below the saddle's bottom edge

    @property
    def plate_front(self):
        return -(self.lens_clearance + self.plate)

    @property
    def rail_height(self):
        return (self.rail_top - self.rail_base) / 2 * math.tan(math.radians(60))

    @property
    def bore(self):
        return self.pen_diameter + self.bore_fit

    @property
    def pen_y(self):
        """Y of the pen's centre line: how far in front of the cover's face the tip lands."""
        slot_end = self.plate_front - self.rail_height - self.clearance
        return slot_end - 2.5 - self.bore / 2

    @property
    def rest(self):
        """Z of the carrier's bottom face when it hangs on the rail."""
        return self.saddle_height - (self.carrier_height - self.cap)


def box(x0, x1, y0, y1, z0, z1):
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).translate((x0, y0, z0))


def dovetail(d, grow=0.0):
    """Rail cross-section in the XY plane, optionally grown by `grow` on every side."""
    y0, y1 = d.plate_front, d.plate_front - d.rail_height
    slope = (d.rail_top - d.rail_base) / 2 / d.rail_height
    return [
        (-d.rail_base / 2 - grow + slope * grow, y0 + grow),
        (d.rail_base / 2 + grow - slope * grow, y0 + grow),
        (d.rail_top / 2 + grow, y1 - grow),
        (-d.rail_top / 2 - grow, y1 - grow),
    ]


def saddle(d, height=None):
    h = height or d.saddle_height
    half = d.cover_width / 2 + d.fit + d.wall           # outer half-width
    back = d.cover_grip                                  # lips reach from the pads back to here

    part = box(-half, half, d.plate_front, -d.lens_clearance, 0, h)
    part = part.union(cq.Workplane("XY").polyline(dovetail(d)).close().extrude(h))
    if height is None:
        pad = d.cover_width / 2 - 1.0
        part = part.union(box(-pad, pad, -d.lens_clearance, 0, 0, d.pad_bottom))
        part = part.union(box(-pad, pad, -d.lens_clearance, 0, h - d.pad_top, h))
        for side in (-1, 1):
            x0, x1 = sorted((side * (half - d.wall), side * half))
            part = part.union(box(x0, x1, -d.lens_clearance, back, d.lip_start, h))
        part = part.union(box(-half, half, d.plate_front, back, h, h + d.wall))
        # Pegs for an optional rubber band that adds pen pressure.
        for side in (-1, 1):
            peg = cq.Workplane("XZ", origin=(side * (half - 6), d.plate_front, 4.0)).circle(1.8).extrude(5.0)
            part = part.union(peg)
    return part


def carrier(d, height=None):
    h = height or d.carrier_height
    back = d.plate_front - 0.4                           # small gap to the saddle
    ring = d.bore / 2 + d.ring_wall
    ring_front = d.pen_y - ring
    slit, ear, ear_len, ear_h = 2.4, 4.0, 9.0, 14.0
    mid = h / 2

    part = box(-d.carrier_width / 2, d.carrier_width / 2, d.pen_y, back, 0, h)
    part = part.union(cq.Workplane("XY").center(0, d.pen_y).circle(ring).extrude(h))
    part = part.union(box(-slit / 2 - ear, slit / 2 + ear, ring_front - ear_len, d.pen_y, mid - ear_h / 2, mid + ear_h / 2))

    # Dovetail slot, open at the bottom and closed by the cap at the top.
    part = part.cut(cq.Workplane("XY").polyline(dovetail(d, grow=d.clearance)).close().extrude(h - d.cap))
    # Bore for the pen and the slit that lets the ring close on it.
    part = part.cut(cq.Workplane("XY").center(0, d.pen_y).circle(d.bore / 2).extrude(h))
    part = part.cut(box(-slit / 2, slit / 2, ring_front - ear_len - 1, d.pen_y, 0, h))
    # M3 clamp screw across the ears, with a hexagonal pocket for the nut.
    screw_y = ring_front - ear_len / 2
    part = part.cut(cq.Workplane("YZ", origin=(-20, screw_y, mid)).circle(1.7).extrude(40))
    part = part.cut(cq.Workplane("YZ", origin=(slit / 2 + ear - 2.2, screw_y, mid)).polygon(6, 6.5).extrude(4))

    # Side lugs for the rubber band; wedge-shaped so they print without support.
    for side in (-1, 1):
        x = side * d.carrier_width / 2
        lug = (
            cq.Workplane("XZ", origin=(0, back - 2.0, 0))
            .polyline([(x, h - 7), (x + side * 4, h - 3), (x + side * 4, h - 1.5), (x, h - 1.5)])
            .close()
            .extrude(5.0)
        )
        part = part.union(lug)
    return part


def gauge(d):
    """Hook the notch under the saddle's bottom edge and let the pen drop onto the shelf, then tighten."""
    reach = -d.pen_y + d.pen_diameter
    half = d.rail_top / 2 + 5
    part = box(-half, half, d.plate_front, -d.lens_clearance + 3.0, -d.tip_drop - 3, 0)           # upright below the saddle
    part = part.union(box(-half, half, -reach, -d.lens_clearance + 3.0, -d.tip_drop - 3, -d.tip_drop))  # shelf under the tip
    part = part.union(box(-half, half, d.plate_front - d.rail_height - 3.0, d.plate_front, -6, 5))  # fence in front of the plate
    # The fence straddles the rail, which also centres the gauge.
    return part.cut(cq.Workplane("XY").polyline(dovetail(d, grow=d.clearance)).close().extrude(5))


def fit_test(d):
    """A short slice of rail and of slot: print this first and adjust `clearance` until it slides freely."""
    return saddle(d, height=14.0).union(carrier(d, height=14.0 + d.cap).translate((d.cover_width / 2 + 22, 0, 0)))


def pen(d, length=140.0, tip_below_carrier=None):
    """A stand-in pen, for pictures and for checking clearances."""
    drop = tip_below_carrier if tip_below_carrier is not None else d.rest + d.tip_drop
    barrel = cq.Workplane("XY").circle(d.pen_diameter / 2).extrude(length - 12)
    tip = cq.Workplane("XY").circle(d.pen_diameter / 2).workplane(offset=-12).circle(0.6).loft()
    return barrel.union(tip).translate((0, d.pen_y, 12 - drop))


def volume(shape):
    return shape.val().Volume()


def check(d):
    """Geometry checks that would catch a mis-built model. Returns a list of (description, ok)."""
    s, c = saddle(d), carrier(d).translate((0, 0, d.rest))
    lifted = carrier(d).translate((0, 0, d.rest + d.float_travel))
    solid = cq.Workplane("XY").center(0, d.pen_y).circle(d.bore / 2 - 0.05).extrude(d.carrier_height).translate((0, 0, d.rest))
    return [
        ("carrier does not collide with the saddle at rest", volume(s.intersect(c)) < 0.01),
        ("carrier does not collide with the saddle when floated up", volume(s.intersect(lifted)) < 0.01),
        ("bore is open the full height of the carrier", volume(c.intersect(solid)) < 0.01),
        ("pen clears the saddle", volume(s.intersect(pen(d).translate((0, 0, d.rest)))) < 0.01),
        ("gauge fits against the saddle without collision", volume(s.intersect(gauge(d))) < 0.01),
        ("gauge shelf sits exactly under the pen tip",
         abs(pen(d).translate((0, 0, d.rest)).val().BoundingBox().zmin + d.tip_drop) < 0.01),
        ("carrier is one solid piece", len(c.val().Solids()) == 1),
        ("saddle is one solid piece", len(s.val().Solids()) == 1),
        ("cap rests on the rail (carrier cannot fall through)",
         volume(c.translate((0, 0, -1.0)).intersect(s)) > 1.0),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default="build")
    parser.add_argument("--pen-diameter", type=float, default=Design.pen_diameter)
    parser.add_argument("--clearance", type=float, default=Design.clearance,
                        help="gap per side between rail and carrier (default %(default)s)")
    parser.add_argument("--lens-clearance", type=float, default=Design.lens_clearance)
    parser.add_argument("--tip-drop", type=float, default=Design.tip_drop)
    args = parser.parse_args()
    d = Design(pen_diameter=args.pen_diameter, clearance=args.clearance,
               lens_clearance=args.lens_clearance, tip_drop=args.tip_drop)
    os.makedirs(args.out, exist_ok=True)

    parts = (("saddle", saddle(d)), ("carrier", carrier(d)), ("gauge", gauge(d)), ("fit_test", fit_test(d)))
    for name, part in parts:
        for extension in ("step", "stl"):
            cq.exporters.export(part, os.path.join(args.out, f"{name}.{extension}"))
        b = part.val().BoundingBox()
        print(f"{name:9s} {b.xlen:5.1f} x {b.ylen:5.1f} x {b.zlen:5.1f} mm   {volume(part) / 1000:5.1f} cm3")

    print(f"pen centre line is {-d.pen_y:.1f} mm in front of the cover face")
    failed = False
    for description, ok in check(d):
        print(("  ok    " if ok else "  FAIL  ") + description)
        failed |= not ok
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
