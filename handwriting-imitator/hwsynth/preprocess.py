"""Clean up scans and phone photos of handwriting for use as style references.

clean_line handles an image of one line; split_page cuts a photo of a whole
handwritten page into its lines.

The generator copies everything about its reference, including how it was
digitised: feed it a hard-thresholded image and it draws blocky letters, feed
it small text in a tall frame and it draws small, coarse text. So this step is
deliberately gentle. It evens out the paper, keeps the soft grey stroke edges,
and crops tight so the writing fills the 64 px frame.
"""

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

WHITE_POINT = 0.9


def flatten(gray, kernel):
    """Grey photo -> ink darkness on even white paper, as floats from 0 (ink) to 1 (paper).

    kernel: size in pixels of the neighbourhood used to estimate the paper; it
    must be wider than a pen stroke and narrower than the lighting changes.
    """
    k = int(kernel) | 1
    # Paper = what is left after closing away the (thin, dark) strokes.
    background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    background = cv2.GaussianBlur(background, (k, k), 0)
    flat = np.clip(gray / np.maximum(background, 1.0), 0.0, 1.0)
    # Linear stretch only: paper noise goes to white, the darkest ink to black,
    # and the anti-aliased edges in between survive.
    black_point = min(np.percentile(flat, 0.5), WHITE_POINT - 0.3)
    return np.clip((flat - black_point) / (WHITE_POINT - black_point), 0.0, 1.0)


def clean_line(image, margin=0.06):
    """Return the line as dark ink on white paper, cropped to the writing."""
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    height = gray.shape[0]
    flat = flatten(gray, max(15, height // 3))

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


def split_page(image):
    """Cut a photo of a handwritten page into its lines.

    Returns (lines, overlay): the line images from top to bottom, all cropped
    to the same height and the same position relative to the writing, and a
    copy of the page with the detected lines marked for checking by eye.

    The common frame matters. The generator draws at the scale of whatever
    reference it is given, so references cropped to different heights would
    make letters change size from one generated line to the next.

    Expects dark ink on plain unlined paper, photographed roughly square-on
    and cropped to the paper.
    """
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    flat = flatten(gray, max(31, min(gray.shape) // 25))
    flat = _rotate(flat, _skew_angle(flat < 0.6))
    ink = flat < 0.6

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    height, width = ink.shape
    top, tall = stats[:, cv2.CC_STAT_TOP], stats[:, cv2.CC_STAT_HEIGHT]
    left, wide = stats[:, cv2.CC_STAT_LEFT], stats[:, cv2.CC_STAT_WIDTH]
    area = stats[:, cv2.CC_STAT_AREA]
    on_edge = (top == 0) | (left == 0) | (top + tall == height) | (left + wide == width)
    letter = np.median(tall[1:][area[1:] >= 12]) if count > 1 else 0
    # Keep letter-sized blobs: drop paper specks, the table around the page, and anything huge.
    keep = (area >= max(6, 0.01 * letter * letter)) & ~on_edge & (tall < 6 * letter)
    keep[0] = False
    if not keep.any():
        raise ValueError("no handwriting found on the page")

    # Lines show up as peaks in how much ink each pixel row holds.
    rows = keep[labels].sum(axis=1).astype(float)
    profile = gaussian_filter1d(rows, sigma=max(2.0, 0.6 * letter))
    peaks, _ = find_peaks(profile, distance=max(3, int(1.5 * letter)), prominence=0.15 * profile.max())
    if not len(peaks):
        raise ValueError("could not find any lines of writing on the page")

    # Each blob belongs to the line whose centre it is nearest, so a tail that
    # dips into the next line's space stays with its own letter.
    owner = np.full(count, -1)
    kept = np.flatnonzero(keep)
    owner[kept] = np.abs(centroids[kept, 1][:, None] - peaks[None, :]).argmin(axis=1)

    above = max((peaks[owner[i]] - top[i]) for i in kept)
    below = max((top[i] + tall[i] - peaks[owner[i]]) for i in kept)
    if len(peaks) > 1:   # one stray tall blob must not stretch every crop
        pitch = np.median(np.diff(peaks))
        above, below = min(above, 0.75 * pitch), min(below, 0.75 * pitch)
    pad = max(2, round(0.06 * (above + below)))
    above, below = int(above) + pad, int(below) + pad

    padded = np.pad(flat, ((above, below), (pad, pad)), constant_values=1.0)
    padded_owner = np.pad(owner[labels], ((above, below), (pad, pad)), constant_values=-1)
    lines, boxes = [], []
    for n, peak in enumerate(peaks):
        mine = np.flatnonzero((owner == n))
        if not len(mine):
            continue
        x0, x1 = left[mine].min(), (left[mine] + wide[mine]).max() + 2 * pad
        window = (slice(peak, peak + above + below), slice(x0, x1))
        crop = padded[window].copy()
        # Blank everything that is not this line's ink, keeping its soft edges.
        own = cv2.dilate((padded_owner[window] == n).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        crop[~own] = 1.0
        lines.append(Image.fromarray((crop * 255).round().astype(np.uint8), mode="L"))
        boxes.append((x0 - pad, peak - above, x1 - pad, peak + below))

    overlay = cv2.cvtColor((flat * 255).astype(np.uint8), cv2.COLOR_GRAY2RGB)
    for n, (x0, y0, x1, y1) in enumerate(boxes):
        colour = [(220, 40, 40), (30, 110, 220)][n % 2]
        cv2.rectangle(overlay, (int(x0), int(y0)), (int(x1), int(y1)), colour, max(2, height // 500))
        cv2.putText(overlay, str(n + 1), (max(int(x0) - int(0.5 * (y1 - y0)), 0), int(y0) + int(0.7 * (y1 - y0))),
                    cv2.FONT_HERSHEY_SIMPLEX, max(0.6, (y1 - y0) / 80), colour, max(2, height // 500))
    return lines, Image.fromarray(overlay)


def _skew_angle(ink, limit=5.0, step=0.25):
    """Angle in degrees that makes the lines of writing most nearly horizontal."""
    scale = min(1.0, 800 / max(ink.shape))
    small = cv2.resize(ink.astype(np.float32), None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    angles = np.arange(-limit, limit + step / 2, step)
    # Level lines give a spiky row profile: rows are either full of ink or empty.
    sharpness = [np.var(_rotate(small, a, fill=0.0).sum(axis=1)) for a in angles]
    return float(angles[int(np.argmax(sharpness))])


def _rotate(image, angle, fill=1.0):
    if angle == 0:
        return image
    h, w = image.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_LINEAR, borderValue=fill)
