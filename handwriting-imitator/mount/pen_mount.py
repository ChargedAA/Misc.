"""Floating pen / pencil holder for the Bambu Lab A1 mini.

    python pen_mount.py --out build --pen-diameter 10

Three printed parts:

  saddle   sits on the printer's own clip-on front cover: lips on the top and
           both sides locate it, two pads take double-sided foam tape, and the
           middle is relieved so it clears the lens dome. A dovetail rail runs
           down its front.
  carrier  slides on the rail and holds any barrel up to 15 mm: two M3 screws
           press the pen back into a V, which centres it whatever its size.
           It hangs from the top of the rail by its own weight.
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

Measured on the owner's A1 mini: cover 53.21 wide, 74.18 tall, rim 3.93 deep,
10.97 thick at the lens (so the dome stands 7.0 proud of the face). The lens
position is read off a photo against the caliper scale: centre about 31 below
the top edge, raised area about 30 across. Print the saddle alone first to
check it against the cover.
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
    lens_clearance: float = 8.0        # the lens dome stands 7.0 proud of the cover face (measured)
    fit: float = 0.3                   # gap per side between lips and cover

    # Saddle
    saddle_height: float = 68.0        # top edge sits level with the top of the cover
    pad_top: float = 14.0              # height of the upper tape pad; must stop above the lens
    pad_bottom: float = 15.0           # height of the lower tape pad
    lip_start: float = 20.0            # side lips stop this far above the bottom, clear of the fan grille
    plate: float = 3.0
    wall: float = 2.0

    # Dovetail rail (60 degree flanks, prints without support with the saddle on its back)
    rail_base: float = 8.0
    rail_top: float = 14.0
    clearance: float = 0.25            # gap per side between rail and carrier; tune with the fit test

    # Carrier
    max_pen: float = 15.0              # largest barrel the clamp accepts
    pen_diameter: float = 10.0         # the pen shown in pictures and used to size the gauge
    side_wall: float = 3.6
    front_wall: float = 5.0            # holds the two captive nuts
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
    def channel(self):
        """Width of the pen cavity."""
        return self.max_pen + 0.6

    @property
    def carrier_width(self):
        return self.channel + 2 * self.side_wall

    @property
    def v_apex(self):
        """Y of the bottom of the V the pen is pressed into."""
        return self.plate_front - self.rail_height - self.clearance - 2.5

    def axis(self, diameter):
        """Y of the centre line of a pen of this diameter once clamped."""
        return self.v_apex - diameter / math.sqrt(2)

    @property
    def pen_y(self):
        """Y of the pictured pen's centre line: how far in front of the cover's face its tip lands."""
        return self.axis(self.pen_diameter)

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
    half, ch = d.carrier_width / 2, d.channel / 2
    cavity_front = d.axis(d.max_pen) - d.max_pen / 2 - 0.5
    front = cavity_front - d.front_wall

    part = box(-half, half, front, back, 0, h)
    # Dovetail slot, open at the bottom and closed by the cap at the top.
    part = part.cut(cq.Workplane("XY").polyline(dovetail(d, grow=d.clearance)).close().extrude(h - d.cap))
    # Pen cavity: a 90 degree V at the back opening into a straight channel.
    cavity = [(0, d.v_apex), (ch, d.v_apex - ch), (ch, cavity_front), (-ch, cavity_front), (-ch, d.v_apex - ch)]
    part = part.cut(cq.Workplane("XY").polyline(cavity).close().extrude(h))

    # Two M3 screws through the front wall push the pen into the V. Their nuts
    # drop into slots open to one side, so the screws have something to turn in.
    nut_y = cavity_front - d.front_wall / 2
    for z in (h * 0.28, h * 0.72):
        part = part.cut(cq.Workplane("XZ", origin=(0, cavity_front + 1, z)).circle(1.7).extrude(d.front_wall + 2))
        part = part.cut(box(-3.0, half + 1, nut_y - 1.4, nut_y + 1.4, z - 2.9, z + 2.9))

    # Side lugs for the rubber band; wedge-shaped so they print without support.
    for side in (-1, 1):
        x = side * half
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
    reach = -d.axis(d.max_pen) + d.max_pen
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
    def barrel(diameter):
        return (cq.Workplane("XY").center(0, d.axis(diameter)).circle(diameter / 2 - 0.05)
                .extrude(d.carrier_height).translate((0, 0, d.rest)))

    lens = cq.Workplane("XZ", origin=(0, 0, d.saddle_height - 31.0)).circle(16.0).extrude(7.2)
    return [
        ("carrier does not collide with the saddle at rest", volume(s.intersect(c)) < 0.01),
        ("carrier does not collide with the saddle when floated up", volume(s.intersect(lifted)) < 0.01),
        ("a 6 mm barrel fits the clamp", volume(c.intersect(barrel(6.0))) < 0.01),
        ("a 15 mm barrel fits the clamp", volume(c.intersect(barrel(d.max_pen))) < 0.01),
        ("a 15 mm barrel clears the saddle", volume(s.intersect(barrel(d.max_pen))) < 0.01),
        ("saddle clears the lens dome (7.0 proud, about 32 across)", volume(s.intersect(lens)) < 0.01),
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

    for diameter in (7.0, 10.0, d.max_pen):
        print(f"{diameter:4.1f} mm barrel: centre line {-d.axis(diameter):.1f} mm in front of the cover face")
    failed = False
    for description, ok in check(d):
        print(("  ok    " if ok else "  FAIL  ") + description)
        failed |= not ok
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
