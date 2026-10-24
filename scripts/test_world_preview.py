"""Offline checks for world_preview.py on tiny synthetic zones: map size, fallbacks, tears and the collision overlay."""
import json

import numpy as np
from PIL import Image

import world_preview as wp

CW, CH = 64, 32


def make_zone(tmp_path, tears=(), collision=None):
    """A 2x2 zone of 64x32 chunks: one painted, one blockout only, two with nothing."""
    zone = tmp_path / "zone"
    for folder in ("images", "blockout", "collision"):
        (zone / folder).mkdir(parents=True)
    chunks = {f"hgz-{c}-{r}": {"col": c, "row": r, "band": "level", "role": "", "brief": ""} for c in range(2) for r in range(2)}
    world = {"zone": "t", "seed": 7, "chunk": [CW, CH], "grid": [2, 2], "chunks": chunks, "links": [],
             "anomaly": {"tears": list(tears)}}
    (zone / "world.json").write_text(json.dumps(world))
    Image.new("RGB", (CW, CH), (200, 30, 30)).save(zone / "images" / "hgz-0-0.png")
    Image.new("RGB", (CW, CH), (90, 90, 90)).save(zone / "blockout" / "hgz-0-0.png")
    Image.new("RGB", (CW, CH), (30, 200, 30)).save(zone / "blockout" / "hgz-1-0.png")
    if collision:
        (zone / "collision" / "hgz-1-1.collision.json").write_text(json.dumps(collision))
    return zone


def noise(w=200, h=120, seed=1):
    return Image.fromarray(np.random.default_rng(seed).integers(0, 255, (h, w, 3), dtype=np.uint8))


def changed(a, b):
    return np.any(np.asarray(a, np.int16) != np.asarray(b, np.int16), axis=2)


def test_map_size_is_grid_times_chunk_times_scale(tmp_path):
    zone = make_zone(tmp_path)
    assert wp.render_map(zone, scale=0.5).size == (2 * CW // 2, 2 * CH // 2)
    assert wp.render_map(zone, scale=1.0).size == (2 * CW, 2 * CH)


def test_missing_images_fall_back_to_blockout_then_grey(tmp_path):
    out = np.asarray(wp.render_map(make_zone(tmp_path), scale=1.0))
    assert tuple(out[5, 5]) == (200, 30, 30)           # images/ wins over blockout/
    assert tuple(out[5, CW + 5]) == (30, 200, 30)      # blockout/ when there is no painting
    assert tuple(out[CH + 2, 2]) == wp.NEUTRAL          # neither: a grey box


def test_cut_is_deterministic_and_stays_in_its_box():
    tear = {"kind": "cut", "chunk": "c", "box": [60, 40, 140, 80], "seed": 11}
    base = noise()
    a, b = wp.draw_tears(base, [tear]), wp.draw_tears(base, [tear])
    assert np.array_equal(np.asarray(a), np.asarray(b))
    assert not np.array_equal(np.asarray(a), np.asarray(wp.draw_tears(base, [dict(tear, seed=12)])))
    ys, xs = np.nonzero(changed(base, a))
    assert len(xs) > 0.5 * 80 * 40
    assert xs.min() >= 60 - wp.MARGIN and xs.max() < 140 + wp.MARGIN
    assert ys.min() >= 40 - wp.MARGIN and ys.max() < 80 + wp.MARGIN
    grey = np.asarray(a)[60, 100].astype(int)
    assert np.abs(grey - wp.TEAR_GREY).max() <= 8 or tuple(grey) == tuple(np.asarray(base)[60, 100])


def test_stretch_changes_only_its_box_and_smears_the_source_row_upward():
    w, h, fy = 120, 100, 80
    arr = np.zeros((h, w, 3), np.uint8)
    arr[:] = (40, 60, 200)                                   # sky
    cols = np.stack([np.arange(w) * 2 % 256, 255 - np.arange(w) * 2 % 256, np.full(w, 120)], 1)
    arr[fy - 10:, :] = cols[None, :, :]                      # the trees: one colour per column
    base = Image.fromarray(arr)
    tear = {"kind": "stretch", "chunk": "c", "box": [20, 10, 100, fy], "from": fy, "seed": 3}
    out = wp.draw_tears(base, [tear])
    assert np.array_equal(np.asarray(out), np.asarray(wp.draw_tears(base, [tear])))
    ys, xs = np.nonzero(changed(base, out))
    assert len(xs) and xs.min() >= 20 and xs.max() < 100 and ys.min() >= 10 and ys.max() < fy
    res = np.asarray(out).astype(float)
    smeared = 0
    for x in range(20, 100, 2):
        source = cols[x].astype(float)
        dist = np.abs(res[10:fy, x] - source).sum(axis=1)[::-1]   # from the source row upward
        assert np.all(np.diff(dist) >= -1e-6), x               # only ever fades away from the source colour
        assert np.array_equal(res[10:fy - 10, x], res[10:fy - 10, x + 1])  # 2 px columns
        smeared += dist[0] < 3 and dist[12] < 3
    assert smeared > 10


def test_tears_follow_origin_and_scale():
    tear = {"kind": "cut", "chunk": "c", "box": [100, 60, 180, 100], "seed": 5}
    base = noise(300, 200)
    out = wp.draw_tears(base, [tear], origin=(50, 20), scale=0.5)
    ys, xs = np.nonzero(changed(base, out))
    m = wp.MARGIN * 0.5
    assert xs.min() >= 50 + 50 - m and xs.max() < 50 + 90 + m
    assert ys.min() >= 20 + 30 - m and ys.max() < 20 + 50 + m


def test_anomaly_map_draws_tears_only_in_their_chunk(tmp_path):
    tear = {"kind": "cut", "chunk": "hgz-1-1", "box": [20, 8, 44, 24], "seed": 9}
    zone = make_zone(tmp_path, tears=[tear])
    clean, anomaly = wp.render_map(zone, 1.0, "clean"), wp.render_map(zone, 1.0, "anomaly")
    ys, xs = np.nonzero(changed(clean, anomaly))
    assert len(xs) and xs.min() >= CW and ys.min() >= CH


def test_collision_overlay_lands_at_zone_coordinates(tmp_path):
    collision = {"chunk": "hgz-1-1", "state": "clean", "size": [CW, CH], "walk": [[[10, 20], [50, 20]]], "oneWay": [],
                 "climb": [], "solid": [{"x": 4, "y": 2, "w": 10, "h": 8, "kind": "wall"}], "noGo": [], "hazard": [], "interact": []}
    zone = make_zone(tmp_path, collision=collision)
    out = np.asarray(wp.render_map(zone, 1.0, collision=True))
    assert tuple(out[CH + 20, CW + 30]) == wp.COLLISION["walk"]
    assert tuple(out[CH + 2, CW + 8]) == wp.COLLISION["solid"]
    assert tuple(out[20, 30]) == (200, 30, 30)  # other chunks untouched


def test_concept_side_by_side_has_both_at_one_height(tmp_path):
    zone = make_zone(tmp_path)
    Image.new("RGB", (100, 50), (0, 0, 255)).save(tmp_path / "concept.png")
    (zone / "zone.json").write_text(json.dumps({"concept": {"anomaly": str(tmp_path / "concept.png"), "clean": str(tmp_path / "concept.png")}}))
    out = wp.render_concept(zone, "anomaly", scale=1.0)
    assert out.size == (2 * CH * 2 + wp.GAP + 2 * CW, wp.LABEL + 2 * CH)


if __name__ == "__main__":
    import pytest  # CI discovers with unittest, which has no pytest: imported only to run this file by hand
    pytest.main([__file__, "-q"])
