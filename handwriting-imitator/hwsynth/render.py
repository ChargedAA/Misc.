"""Turn pen-offset samples into drawable polylines, SVG and PNG."""

import numpy as np
from PIL import Image, ImageDraw


def to_polylines(sample):
    """(T, 3) offsets -> list of (N, 2) arrays of absolute points, one per stroke."""
    sample = np.asarray(sample, dtype=np.float64)
    xy = np.cumsum(sample[:, :2], axis=0)
    ends = np.flatnonzero(sample[:, 2] > 0.5) + 1
    return [s for s in np.split(xy, ends) if len(s)]


def layout_lines(lines, line_gap=0.35, margin=40.0):
    """Stack several lines of polylines into one page. Returns (polylines, width, height)."""
    page, y_cursor, width = [], margin, 0.0
    for polylines in lines:
        pts = np.concatenate(polylines)
        x0, y0 = pts.min(axis=0)
        x1, y1 = pts.max(axis=0)
        for stroke in polylines:
            page.append(stroke - [x0 - margin, y0 - y_cursor])
        width = max(width, x1 - x0)
        y_cursor += (y1 - y0) * (1 + line_gap)
    return page, width + 2 * margin, y_cursor + margin


def to_svg(polylines, width, height, stroke_width=9.0, colour="#1a237e"):
    paths = []
    for stroke in polylines:
        if len(stroke) == 1:
            stroke = np.concatenate([stroke, stroke + 0.01])
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in stroke)
        paths.append(f'<path d="{d}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}">\n'
        f'<rect width="100%" height="100%" fill="white"/>\n'
        f'<g fill="none" stroke="{colour}" stroke-width="{stroke_width}" '
        f'stroke-linecap="round" stroke-linejoin="round">\n' + "\n".join(paths) + "\n</g>\n</svg>\n"
    )


def to_png(polylines, width, height, stroke_width=9.0, colour=(26, 35, 126), scale=0.25, supersample=3):
    k = scale * supersample
    image = Image.new("RGB", (int(width * k), int(height * k)), "white")
    draw = ImageDraw.Draw(image)
    w = max(1, round(stroke_width * k))
    for stroke in polylines:
        pts = [(x * k, y * k) for x, y in stroke]
        if len(pts) > 1:
            draw.line(pts, fill=colour, width=w, joint="curve")
        for x, y in (pts[0], pts[-1]):  # round caps
            draw.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=colour)
    return image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
