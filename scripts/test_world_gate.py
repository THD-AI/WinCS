"""Offline checks for world_gate.py on small synthetic chunks: each check passes clean art and fails its flaw."""
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import world_gate as wg

W, H = 480, 240


def texture(w=W, h=H, seed=0, noise=6.0, base=(170, 120, 70), amp=60, cell=60):
    """Painted-looking stand-in: a smooth warm gradient with fine grain."""
    rng = np.random.default_rng(seed)
    coarse = Image.fromarray(rng.integers(0, amp, (h // cell + 2, w // cell + 2, 3)).astype(np.uint8))
    ramp = np.asarray(coarse.resize((w, h), Image.BICUBIC), np.float32) - amp / 2  # smooth, never periodic
    img = np.asarray(base, np.float32) + ramp + rng.normal(0, noise, (h, w, 3))
    return img.clip(0, 255).astype(np.float32)


def as_pil(img):
    """Float array to a PIL image."""
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


def as_arr(pil):
    """PIL image to a float array."""
    return np.asarray(pil.convert("RGB"), np.float32)


def test_components_counts_two_blobs():
    mask = np.zeros((10, 10), bool)
    mask[1:3, 1:4] = True
    mask[6:9, 5:9] = True
    found = sorted(wg.components(mask))
    assert found == [(6, 1, 1, 3, 2), (12, 5, 6, 8, 8)]


def test_label_joins_a_u_shape():
    mask = np.zeros((6, 6), bool)
    mask[1:5, 1] = mask[1:5, 4] = mask[4, 1:5] = True
    assert len(wg.components(mask)) == 1


def test_seam_passes_continuous_art_and_fails_a_40_step():
    wide = texture(2 * W)
    left, right = wide[:, :W], wide[:, W:]
    assert wg.check_seam(left, right)["pass"]
    assert not wg.check_seam(left, (right + 40).clip(0, 255))["pass"]


def test_seam_vertical():
    tall = texture(W, 2 * H)
    top, bottom = tall[:H], tall[H:]
    assert wg.check_seam(top, bottom, vertical=True)["pass"]
    assert not wg.check_seam(top, (bottom - 40).clip(0, 255), vertical=True)["pass"]


def test_guide_fails_a_flat_rectangle_and_a_walk_stroke():
    clean = texture()
    assert wg.check_guide(clean)["pass"]
    boxed = as_pil(clean)
    ImageDraw.Draw(boxed).rectangle((100, 50, 140, 80), fill=wg.GUIDE["structure"])  # 41 x 31 px
    assert not wg.check_guide(as_arr(boxed))["pass"]
    stroke = as_pil(clean)
    ImageDraw.Draw(stroke).line((50, 150, 250, 160), fill=wg.GUIDE["walk"], width=6)
    assert not wg.check_guide(as_arr(stroke))["pass"]


def test_route_needs_a_surface_on_the_walk_line():
    blockout = Image.new("RGB", (W, H), wg.GUIDE["sky"])
    ImageDraw.Draw(blockout).line((0, 120, W, 120), fill=wg.GUIDE["walk"], width=6)
    blockout = as_arr(blockout)
    flat = texture(noise=2, base=(128, 128, 128))
    flat -= flat.mean((0, 1)) - 128  # no gradient worth a surface
    ground = flat.copy()
    ground[124:] -= 60
    assert wg.check_route(ground, blockout)["pass"]
    assert not wg.check_route(np.full((H, W, 3), 128, np.float32) + np.random.default_rng(1).normal(0, 2, (H, W, 3)),
                              blockout)["pass"]
    assert wg.check_route(flat, np.full((H, W, 3), 200, np.float32))["pass"]  # no walk line, nothing to check


def test_repeat_fails_a_chunk_tiled_from_one_200px_piece():
    wide = 1200
    clean = texture(wide, H, base=(128, 128, 128), amp=200, cell=20)
    blocks, period = wg.check_repeat(clean)
    assert blocks["pass"] and period["pass"]
    piece = as_pil(texture(200, H, seed=3, base=(128, 128, 128), amp=200, cell=20))
    tiled = Image.new("RGB", (wide, H))
    for x in range(0, wide, 200):
        tiled.paste(piece, (x, 0))
    blocks, period = wg.check_repeat(as_arr(tiled))
    assert not blocks["pass"]
    assert not period["pass"]


def test_grain_fails_blur_and_noise():
    concept = texture(seed=5, noise=8)
    assert wg.check_grain(texture(seed=6, noise=8), concept)["pass"]
    blurred = as_arr(as_pil(texture(seed=6, noise=8)).filter(ImageFilter.GaussianBlur(4)))
    assert not wg.check_grain(blurred, concept)["pass"]
    assert not wg.check_grain(texture(seed=6, noise=40), concept)["pass"]


def test_grain_resizes_the_concept_to_the_chunk_height():
    concept = as_arr(as_pil(texture(W, H, seed=5, noise=8)).resize((W // 2, H // 2), Image.NEAREST))
    assert wg.check_grain(texture(seed=6, noise=8), concept)["value"] > 0


def test_palette_fails_another_palette():
    concept = texture(seed=1)
    assert wg.check_palette(texture(seed=2), concept)["pass"]
    assert not wg.check_palette(texture(seed=2, base=(40, 120, 200)), concept)["pass"]


def test_text_finds_a_line_of_letters_and_not_plain_art():
    clean = texture(noise=4, base=(130, 120, 110))
    assert wg.check_text(clean)["pass"]
    lettered = as_pil(clean)
    ImageDraw.Draw(lettered).text((40, 100), "SAMPLE WATERMARK", fill=(0, 0, 0),
                                  font=ImageFont.load_default(size=22))
    assert not wg.check_text(as_arr(lettered))["pass"]


def test_row_gate_writes_json_and_exits_1_on_a_bad_seam(tmp_path):
    wide = texture(2 * W)
    as_pil(wide[:, :W]).save(tmp_path / "a.png")
    as_pil(wide[:, W:]).save(tmp_path / "b.png")
    out = tmp_path / "gate.json"
    assert wg.main(["--row", str(tmp_path), "a", "b", "--out", str(out)]) == 0
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["pass"] and report["a"]["seam b"]["pass"] and report["b"]["seam a"]["pass"]
    as_pil((wide[:, W:] + 40).clip(0, 255)).save(tmp_path / "b.png")
    assert wg.main(["--row", str(tmp_path), "a", "b", "--out", str(out)]) == 1
    assert not json.loads(out.read_text(encoding="utf-8"))["a"]["seam b"]["pass"]


def test_zone_gate_reads_world_blockouts_and_skips_unpainted(tmp_path):
    zone = tmp_path / "z"
    (zone / "images").mkdir(parents=True)
    (zone / "blockout").mkdir()
    chunks = {f"z-{c}-{r}": {"col": c, "row": r, "band": "level", "role": "", "brief": ""}
              for c in range(2) for r in range(2)}
    (zone / "world.json").write_text(json.dumps({"zone": "z", "chunks": chunks, "links": []}), encoding="utf-8")
    tall = texture(W, 2 * H)
    as_pil(tall[:H]).save(zone / "images" / "z-0-0.png")
    as_pil(tall[H:]).save(zone / "images" / "z-0-1.png")
    blockout = Image.new("RGB", (W, H), wg.GUIDE["sky"])
    ImageDraw.Draw(blockout).line((0, 200, W, 200), fill=wg.GUIDE["walk"], width=6)
    blockout.save(zone / "blockout" / "z-0-0.png")
    assert wg.main([str(zone)]) in (0, 1)
    report = json.loads((zone / "previews" / "gate.json").read_text(encoding="utf-8"))
    assert set(report) == {"z-0-0", "z-0-1", "pass"}
    assert "route" in report["z-0-0"] and "route" not in report["z-0-1"]
    assert report["z-0-0"]["seam z-0-1"]["pass"]
