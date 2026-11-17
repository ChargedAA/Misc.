"""Floating pen / pencil holder for a printer toolhead (designed for the Bambu Lab A1 mini).

    python pen_mount.py --out build

Two printed parts:

  body     a flat plate with a vertical dovetail rail. This is what gets fixed
           to the toolhead (two to four M3 screws, or foam tape).
  carrier  slides on the rail and holds the pen in a V-groove with two zip
           ties. It hangs from the top of the rail by its own weight.

The pen is not pressed onto the paper by the printer. When the toolhead comes
down, the tip lands first and the carrier simply stops descending while the
rail carries on a few millimetres. The pen then rests on the paper under its
own weight (plus a rubber band if more pressure is wanted). That one idea
buys three things:

  - the drawing height does not need to be exact, only "somewhere inside the
    float travel";
  - a pencil that wears down keeps touching the paper;
  - nothing rigid is driven into the bed if a height is wrong.

The carrier lifts straight off the top of the rail, so taking the pen away for
homing needs no tools.

All dimensions are in millimetres. Model axes: X across the toolhead, Y towards
the printer (the pen sits at negative Y, in front), Z up.
"""

import argparse
import math
import os
from dataclasses import dataclass

import cadquery as cq


@dataclass
class Design:
    # Body plate
    plate_width: float = 40.0
    plate_height: float = 50.0
    plate_thickness: float = 4.0
    screw_hole: float = 3.4            # clearance for M3
    screw_inset_x: float = 15.5        # hole centres, from the centre line
    screw_inset_z: float = 10.0        # hole centres, from the top and bottom edges

    # Dovetail rail (60 degree flanks, so it prints flat on the plate without support)
    rail_base: float = 8.0             # width where it meets the plate
    rail_top: float = 14.0             # width at its outer face
    clearance: float = 0.25            # gap per side between rail and carrier; tune with the fit test

    # Carrier
    carrier_width: float = 22.0
    carrier_height: float = 40.0
    cap: float = 3.0                   # closed top of the slot; this is what rests on the rail
    v_depth: float = 9.0               # 90 degree V; holds barrels from about 6 to 14 mm
    tie_slot: tuple = (4.6, 2.2)       # zip tie tunnel, (height, depth)
    float_travel: float = 12.0         # how far the carrier may rise before it starts to leave the rail

    @property
    def rail_height(self):
        return (self.rail_top - self.rail_base) / 2 * math.tan(math.radians(60))

    @property
    def v_apex_y(self):
        """Y of the bottom of the V-groove."""
        slot_end = self.plate_thickness + self.rail_height + self.clearance
        return -(slot_end + 2.6 + self.tie_slot[1] + 1.6)

    def pen_axis_y(self, pen_diameter):
        """Y of the pen's centre line: how far in front of the mounting face the tip lands."""
        return self.v_apex_y - pen_diameter / math.sqrt(2)


def dovetail(d, grow=0.0):
    """Rail cross-section in the XY plane, optionally grown by `grow` on every side."""
    y0, y1 = -d.plate_thickness, -(d.plate_thickness + d.rail_height)
    slope = (d.rail_top - d.rail_base) / 2 / d.rail_height
    return [
        (-d.rail_base / 2 - grow + slope * grow, y0 + grow),
        (d.rail_base / 2 + grow - slope * grow, y0 + grow),
        (d.rail_top / 2 + grow, y1 - grow),
        (-d.rail_top / 2 - grow, y1 - grow),
    ]


def body(d, height=None):
    height = height or d.plate_height
    plate = (
        cq.Workplane("XY")
        .box(d.plate_width, d.plate_thickness, height, centered=(True, False, False))
        .translate((0, -d.plate_thickness, 0))
    )
    rail = cq.Workplane("XY").polyline(dovetail(d)).close().extrude(height)
    part = plate.union(rail).edges("|Y").fillet(2.0)

    holes = [(x, z) for x in (-d.screw_inset_x, d.screw_inset_x)
             for z in (d.screw_inset_z, height - d.screw_inset_z) if 0 < z < height]
    part = part.faces(">Y").workplane(origin=(0, 0, 0)).pushPoints([(-x, z) for x, z in holes]).hole(d.screw_hole)

    # Two pegs for an optional rubber band that adds pen pressure.
    for x in (-d.screw_inset_x, d.screw_inset_x):
        peg = cq.Workplane("XZ", origin=(x, -d.plate_thickness, 3.0)).circle(1.8).extrude(5.0)
        part = part.union(peg)
    return part


def carrier(d, height=None):
    height = height or d.carrier_height
    back = -(d.plate_thickness + 0.4)                      # small gap to the plate
    front = d.v_apex_y - d.v_depth
    block = (
        cq.Workplane("XY")
        .box(d.carrier_width, back - front, height, centered=(True, False, False))
        .translate((0, front, 0))
    )
    block = block.edges("|Z").fillet(1.5)

    # Dovetail slot, open at the bottom and closed by the cap at the top.
    slot = cq.Workplane("XY").polyline(dovetail(d, grow=d.clearance)).close().extrude(height - d.cap)
    relief = cq.Workplane("XY").box(d.rail_base + 2 * d.clearance, 1.0, height - d.cap,
                                    centered=(True, False, False)).translate((0, back - 0.5, 0))
    block = block.cut(slot).cut(relief)

    # V-groove for the pen, the full height of the carrier.
    v = (
        cq.Workplane("XY")
        .polyline([(0, d.v_apex_y), (d.v_depth + 1, front - 1), (-d.v_depth - 1, front - 1)])
        .close()
        .extrude(height)
    )
    block = block.cut(v)

    # Tunnels behind the V for two zip ties that strap the pen into it.
    tie_h, tie_d = d.tie_slot
    for z in (height * 0.22, height * 0.72):
        tunnel = (
            cq.Workplane("XY")
            .box(d.carrier_width + 2, tie_d, tie_h, centered=(True, False, False))
            .translate((0, d.v_apex_y + 1.6, z))
        )
        block = block.cut(tunnel)

    # Side lugs for the rubber band; wedge-shaped so they print without support.
    for side in (-1, 1):
        x = side * d.carrier_width / 2
        lug = (
            cq.Workplane("XZ", origin=(0, d.v_apex_y + 4.0, 0))
            .polyline([(x, height - 7), (x + side * 4, height - 3), (x + side * 4, height - 1.5), (x, height - 1.5)])
            .close()
            .extrude(5.0)
        )
        block = block.union(lug)
    return block


def fit_test(d):
    """A short slice of rail and of slot: print this first and adjust `clearance` until it slides freely."""
    rail = body(d, height=14.0)
    slot = carrier(d, height=14.0 + d.cap).translate((d.plate_width / 2 + d.carrier_width / 2 + 6, 0, 0))
    return rail.union(slot)


def pen(d, diameter=10.0, length=140.0, tip_below_carrier=45.0):
    """A stand-in pen, for pictures and for checking clearances."""
    y = d.pen_axis_y(diameter)
    barrel = cq.Workplane("XY").circle(diameter / 2).extrude(length - 12)
    tip = cq.Workplane("XY").circle(diameter / 2).workplane(offset=-12).circle(0.6).loft()
    return barrel.union(tip).translate((0, y, -tip_below_carrier + 12))


def assembly(d, lifted=0.0, pen_diameter=10.0):
    """Body, carrier resting on the rail (or lifted by `lifted` mm), and a pen."""
    rest = d.plate_height - (d.carrier_height - d.cap) + lifted
    return (
        body(d)
        .union(carrier(d).translate((0, 0, rest)))
        .union(pen(d, pen_diameter).translate((0, 0, rest)))
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default="build")
    parser.add_argument("--clearance", type=float, default=Design.clearance,
                        help="gap per side between rail and carrier (default %(default)s)")
    args = parser.parse_args()
    d = Design(clearance=args.clearance)
    os.makedirs(args.out, exist_ok=True)

    for name, part in (("body", body(d)), ("carrier", carrier(d)), ("fit_test", fit_test(d))):
        for extension in ("step", "stl"):
            cq.exporters.export(part, os.path.join(args.out, f"{name}.{extension}"))
        box = part.val().BoundingBox()
        print(f"{name:9s} {box.xlen:5.1f} x {box.ylen:5.1f} x {box.zlen:5.1f} mm   {part.val().Volume() / 1000:5.1f} cm3")
    cq.exporters.export(assembly(d), os.path.join(args.out, "assembly.step"))

    print(f"rail engagement at rest {d.carrier_height - d.cap:.0f} mm, "
          f"after {d.float_travel:.0f} mm of float {d.carrier_height - d.cap - d.float_travel:.0f} mm")
    for diameter in (7.0, 10.0, 12.0):
        print(f"pen {diameter:4.1f} mm: tip lands {-d.pen_axis_y(diameter):.1f} mm in front of the mounting face")


if __name__ == "__main__":
    main()
