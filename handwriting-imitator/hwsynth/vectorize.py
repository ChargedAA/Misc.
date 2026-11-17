"""Turn an image of handwriting into pen paths.

A plotter needs the line the pen should follow, not pixels. This recovers it
from a raster line: thin the ink down to a one-pixel skeleton, then walk the
skeleton and write down where it goes. The result has no notion of the order
or direction the letters were originally written in, which a plotter does not
need; it just has to cover the same ink.
"""

import cv2
import numpy as np
from skimage.morphology import skeletonize

# The 8 neighbours of a pixel as (dy, dx); the first four are edge-adjacent.
NEAR = [(-1, 0), (1, 0), (0, -1), (0, 1)]
DIAGONAL = [(-1, -1), (-1, 1), (1, -1), (1, 1)]


def centerlines(image, upscale=4):
    """Grey image, dark ink on white -> list of (N, 2) float arrays of (x, y) in image pixels.

    A stroke with a single point is a dot (pen down, pen up).
    """
    grey = np.asarray(image.convert("L"))
    grey = cv2.resize(grey, None, fx=upscale, fy=upscale, interpolation=cv2.INTER_CUBIC)
    threshold, _ = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ink = _drop_specks(grey < threshold, min_area=2 * upscale * upscale)
    if not ink.any():
        return []

    skeleton = skeletonize(ink)
    stroke_width = 2 * np.median(cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 5)[skeleton])
    paths = _walk(skeleton, spur_length=1.2 * stroke_width, dot_length=0.6 * stroke_width)

    smooth = max(3, int(1.5 * upscale) | 1)
    paths = [_smooth(p, smooth) for p in paths]
    paths = [(p + 0.5) / upscale - 0.5 for p in paths]
    return _in_writing_order(paths)


def _drop_specks(ink, min_area):
    count, labels, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    keep = stats[:, cv2.CC_STAT_AREA] >= min_area
    keep[0] = False
    return keep[labels]


def _walk(skeleton, spur_length, dot_length):
    """Cover every skeleton link exactly once with as few, as straight, paths as possible."""
    height, width = skeleton.shape
    ys, xs = np.nonzero(skeleton)
    pixels = set(zip(ys.tolist(), xs.tolist()))

    links = {p: set() for p in pixels}
    for y, x in pixels:
        for dy, dx in NEAR:
            if (y + dy, x + dx) in pixels:
                links[(y, x)].add((y + dy, x + dx))
        for dy, dx in DIAGONAL:
            # A diagonal step is redundant when the corner can be turned through an
            # edge-adjacent pixel; keeping both would make a tiny triangle at every bend.
            if (y + dy, x + dx) in pixels and (y + dy, x) not in pixels and (y, x + dx) not in pixels:
                links[(y, x)].add((y + dy, x + dx))
    degree = {p: len(n) for p, n in links.items()}

    def follow(start):
        path = [start]
        while links[path[-1]]:
            here = path[-1]
            if len(path) > 1:
                # At a junction take the exit that bends least, judged over the last few pixels.
                back = path[max(0, len(path) - 6)]
                heading = np.subtract(here, back)
                nxt = max(links[here], key=lambda n: _cosine(heading, np.subtract(n, here)))
            else:
                nxt = next(iter(links[here]))
            links[here].discard(nxt)
            links[nxt].discard(here)
            path.append(nxt)
        return path

    # Loose ends first, so strokes run end to end; then junctions; closed loops last.
    raw = [[p] for p in pixels if degree[p] == 0]
    for wanted in (lambda d: d == 1, lambda d: d > 2, lambda d: True):
        for p in sorted(pixels):
            while links[p] and wanted(degree[p]):
                raw.append(follow(p))

    paths = []
    for path in raw:
        points = np.array([(x, y) for y, x in path], dtype=float)
        length = np.hypot(*np.diff(points, axis=0).T).sum() if len(points) > 1 else 0.0
        at_junction = degree[path[0]] > 2 or degree[path[-1]] > 2
        if at_junction and length < spur_length:
            continue   # skeleton whisker, or a link inside a junction blob
        if not at_junction and length < dot_length:
            points = points.mean(axis=0, keepdims=True)   # a dot
        paths.append(points)
    return paths


def _cosine(a, b):
    return float(np.dot(a, b)) / (np.hypot(*a) * np.hypot(*b) + 1e-9)


def _smooth(points, window):
    """Moving average along the path; the two ends stay where they are."""
    if len(points) < window:
        return points
    pad = window // 2
    padded = np.concatenate([np.repeat(points[:1], pad, axis=0), points, np.repeat(points[-1:], pad, axis=0)])
    kernel = np.ones(window) / window
    out = np.column_stack([np.convolve(padded[:, i], kernel, mode="valid") for i in (0, 1)])
    out[0], out[-1] = points[0], points[-1]
    return out


def _in_writing_order(paths):
    """Left to right, each stroke started from whichever end is nearer the pen."""
    remaining = sorted(paths, key=lambda p: p[:, 0].min())
    ordered, pen = [], None
    while remaining:
        if pen is None:
            i, flip = 0, remaining[0][0, 0] > remaining[0][-1, 0]
        else:
            # Look only a little way ahead, so the pen does not skip a letter and come back.
            ahead = remaining[:6]
            starts = [np.hypot(*(p[0] - pen)) for p in ahead]
            ends = [np.hypot(*(p[-1] - pen)) for p in ahead]
            i = int(np.argmin([min(s, e) for s, e in zip(starts, ends)]))
            flip = ends[i] < starts[i]
        path = remaining.pop(i)
        ordered.append(path[::-1] if flip else path)
        pen = ordered[-1][-1]
    return ordered
