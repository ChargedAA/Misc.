"""Clean up a scan or phone photo of one handwritten line for use as a style reference.

The generator copies everything about its reference, including how it was
digitised: feed it a hard-thresholded image and it draws blocky letters, feed
it small text in a tall frame and it draws small, coarse text. So this step is
deliberately gentle. It evens out the paper, keeps the soft grey stroke edges,
and crops tight so the writing fills the 64 px frame.
"""

import cv2
import numpy as np
from PIL import Image


def clean_line(image, white_point=0.9, margin=0.06):
    """Return the line as dark ink on white paper, cropped to the writing."""
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    height = gray.shape[0]

    # Paper = what is left after closing away the (thin, dark) strokes.
    k = max(15, height // 3) | 1
    background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    background = cv2.GaussianBlur(background, (k, k), 0)
    flat = np.clip(gray / np.maximum(background, 1.0), 0.0, 1.0)

    # Linear stretch only: paper noise goes to white, the darkest ink to black,
    # and the anti-aliased edges in between survive.
    black_point = min(np.percentile(flat, 0.5), white_point - 0.3)
    flat = np.clip((flat - black_point) / (white_point - black_point), 0.0, 1.0)

    ink = flat < 0.6
    stray = ink & ~_without_edge_fragments(ink)
    flat[cv2.dilate(stray.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)] = 1.0
    ink &= ~stray
    if not ink.any():
        raise ValueError("no handwriting found in the style image")

    rows, cols = np.flatnonzero(ink.any(axis=1)), np.flatnonzero(ink.any(axis=0))
    pad = round((rows[-1] - rows[0] + 1) * margin)
    top, bottom = max(rows[0] - pad, 0), min(rows[-1] + pad + 1, flat.shape[0])
    left, right = max(cols[0] - pad, 0), min(cols[-1] + pad + 1, flat.shape[1])
    return Image.fromarray((flat[top:bottom, left:right] * 255).round().astype(np.uint8), mode="L")


def _without_edge_fragments(ink, max_fraction=0.3):
    """Drop small blobs touching the top or bottom edge: tips of the neighbouring lines."""
    height = ink.shape[0]
    count, labels, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    keep = np.ones(count, dtype=bool)
    keep[0] = False
    for i in range(1, count):
        top, h = stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_HEIGHT]
        if (top == 0 or top + h == height) and h < max_fraction * height:
            keep[i] = False
    return keep[labels]
