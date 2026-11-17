import numpy as np
from PIL import Image, ImageDraw

from hwsynth.vectorize import centerlines
from test_gcode import distance_to_path

L_SHAPE = [(20, 12), (20, 50), (70, 50)]
CROSS = [[(100, 15), (140, 50)], [(140, 15), (100, 50)]]
DOT = (170, 30)


def drawing():
    image = Image.new("L", (200, 64), 255)
    draw = ImageDraw.Draw(image)
    draw.line(L_SHAPE, fill=0, width=3, joint="curve")
    for stroke in CROSS:
        draw.line(stroke, fill=0, width=3)
    draw.ellipse([DOT[0] - 2, DOT[1] - 2, DOT[0] + 2, DOT[1] + 2], fill=0)
    return image


def test_paths_follow_the_ink_and_cover_all_of_it():
    paths = centerlines(drawing())
    shapes = [np.array(L_SHAPE, float)] + [np.array(s, float) for s in CROSS]

    # nothing is drawn away from the ink
    for path in paths:
        for point in path:
            nearest = min(distance_to_path(point, s) for s in shapes + [np.array([DOT], float)])
            assert nearest < 2.5

    # and every part of the ink is visited
    lines = [p for p in paths if len(p) > 1]
    for shape in shapes:
        for a, b in zip(shape[:-1], shape[1:]):
            for t in np.linspace(0.1, 0.9, 9):
                assert min(distance_to_path(a + t * (b - a), p) for p in lines) < 2.5


def test_a_blob_becomes_a_single_dot():
    dots = [p for p in centerlines(drawing()) if len(p) == 1]
    assert len(dots) == 1
    assert np.hypot(*(dots[0][0] - DOT)) < 1.5


def test_strokes_come_out_left_to_right():
    starts = [p[:, 0].min() for p in centerlines(drawing())]
    assert starts[0] == min(starts) and starts[-1] == max(starts)


def test_blank_image_gives_no_strokes():
    assert centerlines(Image.new("L", (100, 64), 255)) == []
