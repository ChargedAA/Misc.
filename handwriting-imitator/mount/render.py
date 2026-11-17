"""Shaded pictures of the mount (orthographic, Z up), drawn with a small z-buffer.

    python render.py mount.png
"""

import sys

import numpy as np
from PIL import Image, ImageDraw

from pen_mount import Design, carrier, gauge, pen, saddle

GREY, BLUE, ORANGE, GREEN = (0.74, 0.76, 0.80), (0.27, 0.52, 0.92), (0.96, 0.62, 0.22), (0.35, 0.75, 0.45)


def triangles(shape):
    vertices, faces = shape.val().tessellate(0.05, 0.2)
    return np.array([(p.x, p.y, p.z) for p in vertices])[np.array(faces)]


def camera(azimuth, elevation):
    """Rows: screen right, screen up, towards the viewer."""
    a, e = np.radians(azimuth), np.radians(elevation)
    toward = np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])
    right = np.cross([0, 0, 1], toward)
    right /= np.linalg.norm(right)
    return np.array([right, np.cross(toward, right), toward])


def render(parts, azimuth, elevation, size=520, span=None):
    view = camera(azimuth, elevation)
    light = view.T @ np.array([-0.35, 0.55, 0.75])
    light /= np.linalg.norm(light)
    points = np.concatenate([t.reshape(-1, 3) for t, _ in parts]) @ view.T
    centre = (points.min(0) + points.max(0)) / 2
    span = span or (points.max(0) - points.min(0))[:2].max() * 1.12
    scale = size / span

    image = np.ones((size, size, 3))
    depth = np.full((size, size), -np.inf)
    for tris, colour in parts:
        normal = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
        normal /= np.linalg.norm(normal, axis=1, keepdims=True) + 1e-12
        shade = 0.38 + 0.62 * np.clip(normal @ light, 0, 1)
        p = (tris @ view.T - centre) * scale
        p[..., 0] += size / 2
        p[..., 1] = size / 2 - p[..., 1]
        for (a, b, c), s in zip(p, shade):
            x0, x1 = int(max(min(a[0], b[0], c[0]), 0)), int(min(max(a[0], b[0], c[0]) + 1, size))
            y0, y1 = int(max(min(a[1], b[1], c[1]), 0)), int(min(max(a[1], b[1], c[1]) + 1, size))
            if x0 >= x1 or y0 >= y1:
                continue
            area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if abs(area) < 1e-9:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            w1 = ((xs - a[0]) * (c[1] - a[1]) - (ys - a[1]) * (c[0] - a[0])) / area
            w2 = ((b[0] - a[0]) * (ys - a[1]) - (b[1] - a[1]) * (xs - a[0])) / area
            z = a[2] + w1 * (b[2] - a[2]) + w2 * (c[2] - a[2])
            region = depth[y0:y1, x0:x1]
            hit = (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1) & (z > region)
            region[hit] = z[hit]
            image[y0:y1, x0:x1][hit] = np.array(colour) * s
    # Darken depth discontinuities so edges read clearly.
    finite = np.where(np.isfinite(depth), depth, depth[np.isfinite(depth)].min() - 30)
    edge = np.maximum(np.abs(np.diff(finite, axis=0, prepend=finite[:1])), np.abs(np.diff(finite, axis=1, prepend=finite[:, :1])))
    image[edge > 1.2 * scale / 4] *= 0.35
    return Image.fromarray((image * 255).astype(np.uint8))


def main(path):
    d = Design()
    rest = d.rest

    def assembled(lift, with_gauge=False):
        parts = [(triangles(saddle(d)), GREY),
                 (triangles(carrier(d).translate((0, 0, rest + lift))), BLUE),
                 (triangles(pen(d).translate((0, 0, rest + lift))), ORANGE)]
        return parts + ([(triangles(gauge(d)), GREEN)] if with_gauge else [])

    panels = [
        ("Pen up: carrier hangs from the rail", render(assembled(0), -55, 20, span=175)),
        ("Pen down: toolhead 8 mm lower, pen rests on the paper", render(assembled(8), -55, 20, span=175)),
        ("Setting tip height with the gauge (green)", render(assembled(0, True), -75, 12, span=175)),
        ("Saddle, front: rail, band pegs", render([(triangles(saddle(d)), GREY)], -55, 25)),
        ("Saddle, back: tape pads, lips that grip the cover", render([(triangles(saddle(d)), GREY)], 125, 25)),
        ("Carrier: split ring, M3 clamp screw, slot closed at the top", render([(triangles(carrier(d)), BLUE)], -120, 30)),
    ]
    tile, label = panels[0][1].width, 28
    sheet = Image.new("RGB", (3 * tile, 2 * (tile + label)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (title, picture) in enumerate(panels):
        x, y = (i % 3) * tile, (i // 3) * (tile + label)
        draw.text((x + 14, y + 8), title, fill=(40, 40, 40))
        sheet.paste(picture, (x, y + label))
    sheet.save(path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "mount.png")
