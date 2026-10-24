"""Tests for world_paint.py's up/down growth (offline: the painter is a stand-in, no model calls)."""

from __future__ import annotations

import numpy as np
from PIL import Image

import world_paint as wp


def neighbour() -> Image.Image:
    """A chunk with a vertical colour ramp and a distinct top and bottom row."""
    a = np.zeros((wp.H, wp.W, 3), dtype=np.uint8)
    a[..., 0] = np.linspace(40, 200, wp.H, dtype=np.uint8)[:, None]
    a[..., 2] = 90
    return Image.fromarray(a)


def recorder(colour):
    """A painter that fills the open mask with one colour and records what it was shown."""
    seen = []

    def painter(canvas, mask):
        seen.append((canvas.copy(), np.asarray(mask)[..., 3].copy()))
        out = np.asarray(canvas).copy()
        out[np.asarray(mask)[..., 3] == 0] = colour
        return Image.fromarray(out)
    return painter, seen


def guide() -> Image.Image:
    return Image.new("RGB", (wp.W, wp.H), (200, 220, 240))


def test_up_paints_two_pieces_and_sees_the_neighbour_below():
    painter, seen = recorder((10, 200, 10))
    out = wp.grow_vertical(neighbour(), guide(), True, painter)
    assert out.size == (wp.W, wp.H)
    assert len(seen) == 2
    (c1, m1), (c2, m2) = seen
    assert (m1[:480] == 0).all() and (m1[480:] == 255).all()             # 480 rows to paint, on top
    assert (m2[:240 + wp.OVERLAP_V] == 0).all() and (m2[240 + wp.OVERLAP_V:] == 255).all()
    # the first canvas shows the neighbour's top 240 rows at its bottom, unchanged
    assert np.array_equal(np.asarray(c1)[480:], np.asarray(neighbour())[:240])


def test_down_shows_the_neighbour_on_top_the_right_way_up():
    painter, seen = recorder((10, 200, 10))
    wp.grow_vertical(neighbour(), guide(), False, painter)
    c1, m1 = seen[0]
    assert (m1[:240] == 255).all() and (m1[240:] == 0).all()             # known rows at the top
    assert np.array_equal(np.asarray(c1)[:240], np.asarray(neighbour())[-240:])


def test_seam_matches_the_neighbour_and_fades():
    painter, _ = recorder((10, 200, 10))
    out = np.asarray(wp.grow_vertical(neighbour(), guide(), True, painter)).astype(int)
    edge = np.asarray(neighbour()).astype(int)[0]
    assert np.abs(out[-1] - edge).mean() < 3                              # the bottom row meets the neighbour
    assert np.abs(out[0] - (10, 200, 10)).max() == 0                      # far from the seam: the painting as is


def test_overlap_joins_on_a_cut_inside_the_band():
    calls = iter([(10, 200, 10), (200, 10, 10)])

    def painter(canvas, mask):
        out = np.asarray(canvas).copy()
        out[np.asarray(mask)[..., 3] == 0] = next(calls)
        return Image.fromarray(out)
    out = np.asarray(wp.grow_vertical(neighbour(), guide(), True, painter)).astype(int)
    assert (out[:240] == (200, 10, 10)).all()                             # the second piece above the overlap
    band = out[240:240 + wp.OVERLAP_V]
    assert set(map(tuple, band.reshape(-1, 3))) <= {(200, 10, 10), (10, 200, 10)}
    assert (out[240 + wp.OVERLAP_V:400] == (10, 200, 10)).all()           # the first piece below it
