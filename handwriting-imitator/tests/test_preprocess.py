import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

from hwsynth.preprocess import clean_line, split_page

TEXT = ["Plain words on a page,", "five lines of them, with gaps", "and tails: jumpy gypsy quay.", "Short one.", "The last line ends here."]


def page(tilt=0.0, shade=True):
    """Text on paper with uneven light, optionally tilted, as a stand-in for a photo."""
    image = Image.new("L", (900, 520), 255)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=38)
    for i, line in enumerate(TEXT):
        draw.text((60, 50 + i * 85), line, fill=25, font=font)
    pixels = np.asarray(image, dtype=np.float32)
    if tilt:
        matrix = cv2.getRotationMatrix2D((450, 260), tilt, 1.0)
        pixels = cv2.warpAffine(pixels, matrix, (900, 520), borderValue=255)
    if shade:
        pixels = pixels * np.linspace(0.55, 1.0, 900)[None, :]
    return Image.fromarray(pixels.astype(np.uint8))


@pytest.mark.parametrize("tilt", [0.0, 2.0, -3.0])
def test_finds_every_line_in_order(tilt):
    lines, _ = split_page(page(tilt))
    assert len(lines) == len(TEXT)
    widths = [np.ptp(np.flatnonzero(np.asarray(line).min(axis=0) < 128)) for line in lines]
    # "Short one." is the narrowest line and the third the widest in this font,
    # so the lines came back in page order whatever the tilt.
    assert int(np.argmin(widths)) == 3 and int(np.argmax(widths)) == 2


def test_lines_share_one_frame_and_come_out_clean():
    lines, overlay = split_page(page())
    assert len({line.height for line in lines}) == 1
    for line in lines:
        pixels = np.asarray(line)
        assert pixels.max() == 255 and pixels.min() < 80          # white paper, dark ink
        assert (pixels[[0, -1]] == 255).all()                     # no neighbour's ink at the edges
    assert overlay.size == page().size


def test_blank_page_is_reported():
    with pytest.raises(ValueError):
        split_page(Image.new("L", (400, 300), 240))


def test_clean_line_crops_to_the_writing():
    lines, _ = split_page(page())
    wide = Image.new("L", (lines[0].width + 400, lines[0].height + 120), 200)
    wide.paste(lines[0], (200, 60))
    cleaned = clean_line(wide)
    assert cleaned.width < lines[0].width + 40 and cleaned.height < lines[0].height + 20
