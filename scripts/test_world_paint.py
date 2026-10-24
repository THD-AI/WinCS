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


def test_settle_up_fades_the_upper_row_and_leaves_the_row_below():
    import json
    import shutil
    import tempfile
    from pathlib import Path
    zone_dir = Path(tempfile.mkdtemp())
    name = f"test-settle-{zone_dir.name}"
    (zone_dir / "images").mkdir()
    (zone_dir / "zone.json").write_text(json.dumps({"zone": name}))
    chunks = {"a": {"id": "a", "col": 0, "row": 0}, "b": {"id": "b", "col": 0, "row": 1}}
    (zone_dir / "world.json").write_text(json.dumps({"chunks": chunks}))
    Image.new("RGB", (wp.W, wp.H), (100, 100, 100)).save(zone_dir / "images" / "a.png")
    below = neighbour()
    below.save(zone_dir / "images" / "b.png")
    try:
        wp.settle(zone_dir, 0, up=True)
        raw = wp.ROOT / "tmp" / "zones" / name / "join"
        out = np.asarray(Image.open(raw / "a.png")).astype(int)
        assert np.abs(out[-1] - np.asarray(below)[0].astype(int)).max() <= 1   # the bottom row meets the row below
        assert (out[0] == 100).all()                                           # far from the seam: unchanged
        assert not (raw / "b.png").exists()                                    # the row below is never touched
    finally:
        shutil.rmtree(zone_dir)
        shutil.rmtree(wp.ROOT / "tmp" / "zones" / name, ignore_errors=True)


def test_a_passage_join_paints_a_wider_window_with_its_brief(monkeypatch):
    seen = {}

    def call(name, prompt, base, mask, refs, zone, extra=()):
        seen["prompt"], seen["open"] = prompt, (np.asarray(mask)[..., 3] == 0)
        return base
    monkeypatch.setattr(wp, "call", call)
    zone = {"style": "", "people": "", "inputs": ["x"]}
    a, b = neighbour(), neighbour()
    assert wp.join_one(zone, a, b, "left-right", "a|b", half=320, brief="a breach in the wall") is not None
    cols = np.where(seen["open"][0])[0]
    assert (cols.min(), cols.max()) == (wp.W // 2 - 320, wp.W // 2 + 319)
    assert "a breach in the wall" in seen["prompt"] and "THE PASSAGE" in seen["prompt"]
    wp.join_one(zone, a, b, "left-right", "a|b", half=(480, 160))
    assert "THE PASSAGE" not in seen["prompt"]
    cols = np.where(seen["open"][0])[0]
    assert (cols.min(), cols.max()) == (wp.W // 2 - 480, wp.W // 2 + 159)    # leaned into the left chunk


def test_a_median_step_matches_the_drift_but_does_not_smear_a_speck():
    new = Image.new("RGB", (wp.W, wp.H), (100, 100, 100))
    below = np.full((wp.H, wp.W, 3), 120, np.uint8)
    below[0, 500:504] = (250, 40, 40)                                      # a leaf in the row below
    out = np.asarray(wp.match_rows(new, Image.fromarray(below), ramp=48, blur=0, median=31)).astype(int)
    assert (out[-1, :400] == 120).all()                                    # the drift is matched
    assert (out[-40:, 500:504] < 125).all()                                # the leaf is not dragged up
