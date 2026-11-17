import numpy as np
import pytest

from hwsynth.gcode import BED_MM, Plotter, place_on_bed, read_back, simplify, to_gcode


def page():
    """Two strokes and a dot, in page millimetres (y down)."""
    t = np.linspace(0, np.pi, 40)
    wave = np.column_stack([t * 20, 5 + 3 * np.sin(4 * t)])
    return [wave, np.array([[0.0, 12.0], [30.0, 12.0], [30.0, 20.0]]), np.array([[40.0, 16.0]])]


def distance_to_path(point, path):
    if len(path) == 1:
        return np.hypot(*(path[0] - point))
    a, b = path[:-1], path[1:]
    along = np.clip(((point - a) * (b - a)).sum(1) / np.maximum(((b - a) ** 2).sum(1), 1e-12), 0, 1)
    return np.hypot(*(a + along[:, None] * (b - a) - point).T).min()


def test_round_trip_reproduces_the_drawing():
    plotter = Plotter(z_draw=12.0, pen_offset=(-5.0, 33.0))
    strokes = page()
    drawn, z_values = read_back(to_gcode(strokes, plotter), plotter.pen_offset)
    expected = place_on_bed(strokes, plotter)

    assert len(drawn) == len(expected)
    for got, want in zip(drawn, expected):
        # every original point lies on the plotted path, to within simplification and rounding
        assert max(distance_to_path(p, got) for p in want) < 0.05
        assert np.allclose(got[0], want[0], atol=0.01) and np.allclose(got[-1], want[-1], atol=0.01)
    assert z_values == [12.0, 15.0, 27.0]


def test_page_is_flipped_so_the_top_is_at_the_back_of_the_bed():
    plotter = Plotter(z_draw=10.0)
    top, bottom = np.array([[0.0, 0.0], [10.0, 0.0]]), np.array([[0.0, 20.0], [10.0, 20.0]])
    placed = place_on_bed([top, bottom], plotter)
    assert placed[0][0, 1] > placed[1][0, 1]
    assert np.isclose(placed[1][0, 0], placed[0][0, 0])


def test_everything_stays_cold_and_on_the_bed():
    plotter = Plotter(z_draw=12.0, pen_offset=(0.0, 30.0))
    gcode = to_gcode(page(), plotter)
    assert "M104 S0" in gcode and "M140 S0" in gcode
    assert " E" not in "".join(line.split(";")[0] for line in gcode.splitlines())
    for line in gcode.splitlines():
        code = line.split(";")[0]
        for axis in "XY":
            if f" {axis}" in code and code.startswith(("G0", "G1")):
                value = float(code.split(f" {axis}")[1].split()[0])
                assert 0 <= value <= BED_MM


def test_air_run_never_reaches_the_paper():
    plotter = Plotter(z_draw=12.0)
    _, z_values = read_back(to_gcode(page(), plotter, air=5.0))
    assert min(z_values) == 17.0


def test_drawing_too_big_for_the_bed_is_refused():
    with pytest.raises(ValueError, match="usable"):
        to_gcode([np.array([[0.0, 0.0], [170.0, 0.0]])], Plotter(z_draw=12.0))


def test_pen_offset_that_pushes_the_nozzle_off_the_bed_is_refused():
    wide = [np.array([[0.0, 0.0], [155.0, 0.0]])]
    with pytest.raises(ValueError, match="nozzle"):
        to_gcode(wide, Plotter(z_draw=12.0, pen_offset=(40.0, 0.0)))


def test_simplify_keeps_corners_and_drops_collinear_points():
    line = np.array([[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]], dtype=float)
    assert simplify(line, 0.01).tolist() == [[0, 0], [3, 0], [3, 2]]
