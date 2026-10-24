"""Artifact gate (stage 4 of the world pipeline, docs/09 "World pipeline"): reject painted chunks with seams,
guide colours left in, smoothed-away routes, copy-pasted tiles, blur or noise, palette drift or text.

    python scripts/world_gate.py art/zones/<zone> [--images DIR] [--chunks id ...] [--concept PNG] [--out JSON]
    python scripts/world_gate.py --row art/stages/hidden-garden/images hg-0-0 hg-1-0 hg-2-0 \
        --concept art/locations/images/hidden-garden-clean.png        # chunks side by side in one row

Zone mode reads world.json (grid positions), blockout/<id>.png (the flat guide) and images/<id>.png (the
painting; a chunk without one is skipped), and the concept from zone.json ("clean", else "anomaly"). Row mode
puts the named chunks of one folder next to each other, left to right, with no blockouts. Every check prints
one line per chunk (a seam one line per neighbour): PASS/FAIL, the number and its limit. The result goes to
previews/gate.json in the zone ({chunk: {check: {"value", "limit", "pass"}}, "pass": bool}; row mode:
tmp/gate/<folder>.json) and the script exits 1 when anything fails.

The checks are pure functions on numpy arrays (H x W x 3 floats, 0..255):
- seam:    the colour step across a seam against each side's own step one pixel inside.
- guide:   flat GUIDE colours left in (connected regions > GUIDE_AREA px) or red walk-line strokes.
- route:   along the blockout's walk lines the painting must show a surface (a strong vertical luminance edge).
- repeat:  the same non-flat 48x48 block at many places, or one horizontal period explaining the picture.
- grain:   high-frequency energy (mean |Laplacian|) against the concept's at the same height: blur or noise.
- palette: 6x6x6 colour histogram against the concept's (1 - histogram intersection).
- text:    best effort only. A row of >= TEXT_RUN small near-black or near-white components of the same height
           with aligned bottoms. It finds printed lines of letters or a watermark; it misses single words,
           letters in mid tones, handwriting and anything the painter blended into the art.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grow_stage import GUIDE  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

SEAM_RATIO, SEAM_PLUS = 2.5, 10.0  # a seam may step 2.5x the art's own step, and always 10 more (flat art)
GUIDE_DIST = 6         # a pixel this close (RGB distance) to a GUIDE colour is guide colour; at 10 the flat
                       # haze grey (143,132,136) of hg-4-0's far forest (970 px, 8.7 off the structure grey) fails
GUIDE_AREA = 600       # painted grain never stays this flat over 600 px; a forgotten guide patch does
WALK_DIST = 40         # a walk-line stroke left in: pixels this close to the walk red ...
WALK_RUN = 80          # ... in this many consecutive columns (autumn leaves are red, but never in a 80 px line)
ROUTE_REACH = 12       # the surface may lie this far above or below the guide's walk line
ROUTE_EDGE = 12.0      # a vertical luminance step this strong (mean over 5 columns) counts as a surface
ROUTE_MIN = 0.6        # this share of the walk line must have a surface under it
REPEAT_SCALE, REPEAT_BLOCK = 4, 48  # blocks are compared on a 4x smaller picture, 8 grey levels (near-copies)
REPEAT_LEVELS = 8
REPEAT_FLAT = 3        # a block spanning fewer grey levels is flat (sky, water) and may repeat
REPEAT_MAX = 4         # the same block at more than 4 places is a tile, not painting
PERIOD_SHIFTS = (64, 1080)  # horizontal periods searched, px
PERIOD_MAX = 0.6       # correlation at the best shift (row means removed); the shipped art reaches 0.36 (hg-4-0, the pond)
GRAIN_MIN, GRAIN_MAX = 0.6, 2.5  # high-frequency energy against the concept: blur below, noise above
PALETTE_BINS = 6
PALETTE_MAX = 0.55     # 1 - histogram intersection; the shipped Hidden Garden chunks reach 0.35
TEXT_DARK, TEXT_LIGHT = 40, 225  # glyph pixels are near-black or near-white
TEXT_HEIGHT = (6, 40)  # glyph height in px at chunk scale
TEXT_RUN = 6           # this many glyphs in one aligned row is a line of text
TEXT_CONTRAST = 100    # a glyph stands this far (mean luminance) off the pixels right around it; dark reeds do not


def load(path: Path) -> np.ndarray:
    """An image as an H x W x 3 float array."""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def luminance(img: np.ndarray) -> np.ndarray:
    """Rec. 601 luma of an RGB array."""
    return img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114


def result(value: float, limit: float, ok: bool) -> dict:
    """One check's entry in gate.json."""
    return {"value": round(float(value), 3), "limit": round(float(limit), 3), "pass": bool(ok)}


def label(mask: np.ndarray) -> np.ndarray:
    """Connected components (4-neighbour) of a boolean mask: a root index per pixel, -1 outside."""
    h, w = mask.shape
    flat = mask.ravel()
    parent = np.where(flat, np.arange(h * w), -1)
    idx = np.arange(h * w).reshape(h, w)
    right = mask[:, :-1] & mask[:, 1:]
    down = mask[:-1] & mask[1:]
    a = np.concatenate([idx[:, :-1][right], idx[:-1][down]])
    b = np.concatenate([idx[:, 1:][right], idx[1:][down]])
    while True:
        pa, pb = parent[a], parent[b]
        low = np.minimum(pa, pb)
        before = parent.copy()
        np.minimum.at(parent, pa, low)
        np.minimum.at(parent, pb, low)
        while True:  # pointer jumping: every pixel straight to its root
            jumped = np.where(parent >= 0, parent[np.maximum(parent, 0)], -1)
            if np.array_equal(jumped, parent):
                break
            parent = jumped
        if np.array_equal(parent, before):
            return parent.reshape(h, w)


def components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    """(area, x0, y0, x1, y1) of each connected component of a mask (x1, y1 inclusive)."""
    roots = label(mask)
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return []
    _, inv = np.unique(roots[ys, xs], return_inverse=True)
    n = inv.max() + 1
    area = np.bincount(inv, minlength=n)
    box = [np.full(n, 1 << 30), np.full(n, 1 << 30), np.full(n, -1), np.full(n, -1)]
    np.minimum.at(box[0], inv, xs)
    np.minimum.at(box[1], inv, ys)
    np.maximum.at(box[2], inv, xs)
    np.maximum.at(box[3], inv, ys)
    return list(zip(area.tolist(), *(b.tolist() for b in box)))


def colour_mask(img: np.ndarray, colour, dist: float) -> np.ndarray:
    """Pixels within an RGB distance of a colour."""
    return np.sqrt(((img - np.asarray(colour, np.float32)) ** 2).sum(-1)) <= dist


# --- the checks -------------------------------------------------------------------------------------------

def seam_step(a: np.ndarray, b: np.ndarray, vertical: bool = False) -> tuple[float, float]:
    """(step across the seam, the art's own step one pixel inside); a left of b, or above it when vertical."""
    if vertical:
        a, b = a.transpose(1, 0, 2), b.transpose(1, 0, 2)
    step = lambda u, v: float(np.abs(u - v).mean())  # noqa: E731
    seam = step(a[:, -1], b[:, 0])
    own = (step(a[:, -2], a[:, -1]) + step(b[:, 0], b[:, 1])) / 2
    return seam, own


def check_seam(a: np.ndarray, b: np.ndarray, vertical: bool = False) -> dict:
    """Fail a seam that steps more than SEAM_RATIO x (and SEAM_PLUS more than) the art's own step."""
    seam, own = seam_step(a, b, vertical)
    limit = max(SEAM_RATIO * own, own + SEAM_PLUS)
    return result(seam, limit, seam <= limit)


def check_guide(img: np.ndarray) -> dict:
    """Largest flat guide-colour region (px), or a walk-line stroke; fail above GUIDE_AREA."""
    mask = np.zeros(img.shape[:2], bool)
    for colour in GUIDE.values():
        mask |= colour_mask(img, colour, GUIDE_DIST)
    biggest = max((c[0] for c in components(mask)), default=0)
    cols = colour_mask(img, GUIDE["walk"], WALK_DIST).any(0)
    run = longest_run(cols)
    value = max(biggest, GUIDE_AREA + 1 if run >= WALK_RUN else 0)
    return result(value, GUIDE_AREA, value <= GUIDE_AREA)


def longest_run(flags: np.ndarray) -> int:
    """Length of the longest run of True in a 1-D array."""
    padded = np.concatenate([[0], flags.astype(np.int8), [0]])
    edges = np.flatnonzero(np.diff(padded))
    return int((edges[1::2] - edges[::2]).max()) if len(edges) else 0


def check_route(img: np.ndarray, blockout: np.ndarray) -> dict:
    """Share of the blockout's walk-line pixels with a strong vertical luminance edge within ROUTE_REACH px."""
    walk = colour_mask(blockout, GUIDE["walk"], GUIDE_DIST)
    if not walk.any():
        return result(1.0, ROUTE_MIN, True)
    lum = luminance(img)
    grad = np.zeros_like(lum)
    grad[:-1] = np.abs(np.diff(lum, axis=0))
    k = np.ones(5, np.float32) / 5  # mean over 5 columns: one dark pixel is not a surface
    grad = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 1, grad)
    reach = np.zeros_like(grad)
    h = grad.shape[0]
    for dy in range(-ROUTE_REACH, ROUTE_REACH + 1):
        lo, hi = max(0, dy), min(h, h + dy)
        reach[lo - dy:hi - dy] = np.maximum(reach[lo - dy:hi - dy], grad[lo:hi])
    share = float((reach[walk] >= ROUTE_EDGE).mean())
    return result(share, ROUTE_MIN, share >= ROUTE_MIN)


def small_grey(img: np.ndarray) -> np.ndarray:
    """The picture REPEAT_SCALE x smaller, in REPEAT_LEVELS grey levels."""
    pil = Image.fromarray(luminance(img).clip(0, 255).astype(np.uint8))
    pil = pil.resize((max(1, pil.width // REPEAT_SCALE), max(1, pil.height // REPEAT_SCALE)), Image.BOX)
    return (np.asarray(pil, np.int32) * REPEAT_LEVELS // 256).astype(np.uint8)


def block_repeats(img: np.ndarray) -> int:
    """Most places (>= one block apart) the same non-flat 48x48 block appears, compared on the small picture."""
    q = small_grey(img)
    s = REPEAT_BLOCK // REPEAT_SCALE
    if q.shape[0] < s or q.shape[1] < s:
        return 0
    win = np.lib.stride_tricks.sliding_window_view(q, (s, s))
    ys, xs = np.mgrid[:win.shape[0], :win.shape[1]]
    flat = win.reshape(-1, s * s)
    keep = (flat.max(1) - flat.min(1)) >= REPEAT_FLAT
    flat, ys, xs = flat[keep], ys.ravel()[keep], xs.ravel()[keep]
    if not len(flat):
        return 0
    keys = np.ascontiguousarray(flat).view(np.dtype((np.void, s * s))).ravel()
    _, inv, counts = np.unique(keys, return_inverse=True, return_counts=True)
    best = 1
    for group in np.flatnonzero(counts > REPEAT_MAX):
        places: list[tuple[int, int]] = []
        for y, x in zip(ys[inv == group], xs[inv == group]):
            if all(abs(y - py) >= s or abs(x - px) >= s for py, px in places):
                places.append((y, x))
        best = max(best, len(places))
    return best


def period_score(img: np.ndarray) -> float:
    """Best correlation of the picture with itself shifted 64..1080 px sideways (row means removed)."""
    lum = luminance(img)
    pil = Image.fromarray(lum.clip(0, 255).astype(np.uint8))
    small = np.asarray(pil.resize((max(1, pil.width // REPEAT_SCALE), max(1, pil.height // REPEAT_SCALE)),
                                  Image.BOX), np.float32)
    small = small - small.mean(1, keepdims=True)
    w = small.shape[1]
    best = 0.0
    for shift in range(PERIOD_SHIFTS[0] // REPEAT_SCALE, min(PERIOD_SHIFTS[1] // REPEAT_SCALE, w // 2) + 1):
        u, v = small[:, :-shift], small[:, shift:]
        den = float(np.sqrt((u * u).sum() * (v * v).sum()))
        if den > 0:
            best = max(best, float((u * v).sum()) / den)
    return best


def check_repeat(img: np.ndarray) -> tuple[dict, dict]:
    """(block repeats, horizontal period) results."""
    places, corr = block_repeats(img), period_score(img)
    return result(places, REPEAT_MAX, places <= REPEAT_MAX), result(corr, PERIOD_MAX, corr <= PERIOD_MAX)


def grain(img: np.ndarray) -> float:
    """Mean absolute 4-neighbour Laplacian of the luminance."""
    lum = luminance(img)
    lap = 4 * lum[1:-1, 1:-1] - lum[:-2, 1:-1] - lum[2:, 1:-1] - lum[1:-1, :-2] - lum[1:-1, 2:]
    return float(np.abs(lap).mean())


def at_height(img: np.ndarray, height: int) -> np.ndarray:
    """An RGB array resized (aspect kept) to a height."""
    pil = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    width = max(1, round(pil.width * height / pil.height))
    return np.asarray(pil.resize((width, height), Image.LANCZOS), np.float32)


def check_grain(img: np.ndarray, concept: np.ndarray) -> dict:
    """Chunk grain / concept grain (concept resized to the chunk's height); fail outside GRAIN_MIN..GRAIN_MAX."""
    ratio = grain(img) / max(grain(at_height(concept, img.shape[0])), 1e-6)
    limit = GRAIN_MIN if ratio < 1 else GRAIN_MAX
    return result(ratio, limit, GRAIN_MIN <= ratio <= GRAIN_MAX)


def histogram(img: np.ndarray) -> np.ndarray:
    """Normalised PALETTE_BINS^3 colour histogram."""
    q = (img.reshape(-1, 3).clip(0, 255) * PALETTE_BINS / 256).astype(np.int64)
    idx = (q[:, 0] * PALETTE_BINS + q[:, 1]) * PALETTE_BINS + q[:, 2]
    hist = np.bincount(idx, minlength=PALETTE_BINS ** 3).astype(np.float64)
    return hist / hist.sum()


def check_palette(img: np.ndarray, concept: np.ndarray) -> dict:
    """1 - histogram intersection with the concept; fail above PALETTE_MAX."""
    dist = 1 - float(np.minimum(histogram(img), histogram(concept)).sum())
    return result(dist, PALETTE_MAX, dist <= PALETTE_MAX)


def integral(a: np.ndarray) -> np.ndarray:
    """Summed-area table with a zero row and column in front."""
    out = np.zeros((a.shape[0] + 1, a.shape[1] + 1), np.float64)
    out[1:, 1:] = a.cumsum(0).cumsum(1)
    return out


def box_sum(table: np.ndarray, x0: int, y0: int, x1: int, y1: int) -> float:
    """Sum over a box (inclusive) from a summed-area table."""
    return float(table[y1 + 1, x1 + 1] - table[y0, x1 + 1] - table[y1 + 1, x0] + table[y0, x0])


def glyphs(mask: np.ndarray, lum: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    """Components shaped like letters: TEXT_HEIGHT tall, partly filled, TEXT_CONTRAST off their background."""
    h_img, w_img = mask.shape
    t_all, t_in, t_n = integral(lum), integral(lum * mask), integral(mask.astype(np.float64))
    out = []
    for area, x0, y0, x1, y1 in components(mask):
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if not (TEXT_HEIGHT[0] <= h <= TEXT_HEIGHT[1] and 2 <= w <= 1.5 * h and 0.15 <= area / (w * h) <= 0.85):
            continue
        box = (max(0, x0 - 2), max(0, y0 - 2), min(w_img - 1, x1 + 2), min(h_img - 1, y1 + 2))
        n_in = box_sum(t_n, *box)
        n_out = (box[2] - box[0] + 1) * (box[3] - box[1] + 1) - n_in
        if n_out <= 0:
            continue
        inside = box_sum(t_in, *box) / n_in
        outside = (box_sum(t_all, *box) - box_sum(t_in, *box)) / n_out
        if abs(outside - inside) >= TEXT_CONTRAST:
            out.append((area, x0, y0, x1, y1))
    return out


def text_run(img: np.ndarray) -> int:
    """Longest row of glyphs with the same height (+-25 %), bottoms within 2 px and gaps under one height."""
    lum = luminance(img)
    best = 0
    for mask in (lum <= TEXT_DARK, lum >= TEXT_LIGHT):
        found = sorted(glyphs(mask, lum), key=lambda g: g[1])
        used = set()
        for i, g in enumerate(found):
            if i in used:
                continue
            chain, last = 1, g
            for j in range(i + 1, len(found)):
                c = found[j]
                h, hc = last[4] - last[2] + 1, c[4] - c[2] + 1
                gap = c[1] - last[3]
                if gap > h:
                    if c[1] - last[3] > 2 * TEXT_HEIGHT[1]:
                        break
                    continue
                if abs(c[4] - last[4]) <= 2 and abs(hc - h) <= 0.25 * h and gap >= 0:
                    chain, last = chain + 1, c
                    used.add(j)
            best = max(best, chain)
    return best


def check_text(img: np.ndarray) -> dict:
    """Longest aligned glyph row; fail at TEXT_RUN or more."""
    run = text_run(img)
    return result(run, TEXT_RUN - 1, run < TEXT_RUN)


def check_chunk(img: np.ndarray, concept: np.ndarray | None, blockout: np.ndarray | None) -> dict:
    """Every per-chunk check (seams are checked by the caller, which knows the neighbours)."""
    out = {"guide": check_guide(img)}
    if blockout is not None:
        out["route"] = check_route(img, blockout)
    out["repeat"], out["period"] = check_repeat(img)
    if concept is not None:
        out["grain"] = check_grain(img, concept)
        out["palette"] = check_palette(img, concept)
    out["text"] = check_text(img)
    return out


# --- zone and row --------------------------------------------------------------------------------------------

def here(path: str | Path) -> Path:
    """A path as given, or relative to the repo root."""
    p = Path(path)
    return p if p.is_absolute() or p.exists() else ROOT / p


def gate(grid: dict[str, tuple[int, int]], images: Path, concept: np.ndarray | None,
         blockouts: Path | None, only: list[str] | None = None) -> dict:
    """Run every check on the chunks of a grid ({id: (col, row)}) that have a painting; gate.json's content."""
    have = {cid: images / f"{cid}.png" for cid in grid if (images / f"{cid}.png").exists()}
    at = {pos: cid for cid, pos in grid.items()}
    todo = [cid for cid in have if not only or cid in only]
    report: dict = {}
    cache: dict[str, np.ndarray] = {}
    img = lambda cid: cache.setdefault(cid, load(have[cid]))  # noqa: E731
    for cid in todo:
        bo = blockouts / f"{cid}.png" if blockouts else None
        report[cid] = check_chunk(img(cid), concept, load(bo) if bo and bo.exists() else None)
        c, r = grid[cid]
        for dc, dr in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            other = at.get((c + dc, r + dr))
            if other not in have:
                continue
            first, second = (other, cid) if dc < 0 or dr < 0 else (cid, other)
            report[cid][f"seam {other}"] = check_seam(img(first), img(second), vertical=dr != 0)
        cache = {k: v for k, v in cache.items() if k == cid or k in todo[todo.index(cid) + 1:]}
    report["pass"] = all(ch["pass"] for cid in todo for ch in report[cid].values())
    return report


def show(report: dict) -> None:
    """One line per chunk per check."""
    for cid, checks in report.items():
        if cid == "pass":
            continue
        for name, r in checks.items():
            print(f"{cid:>10}  {name:<18} {'PASS' if r['pass'] else 'FAIL'}  {r['value']:>10g}  (limit {r['limit']:g})")
    print("gate:", "PASS" if report["pass"] else "FAIL")


def main(argv: list[str] | None = None) -> int:
    """Gate a zone (or a row of chunks), write gate.json, exit 1 on any failure."""
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("zone", nargs="?", help="art/zones/<zone>")
    ap.add_argument("--images", help="read painted chunks from here instead of <zone>/images")
    ap.add_argument("--chunks", nargs="+", help="only these chunks")
    ap.add_argument("--concept", help="concept image (default: zone.json concept.clean, else .anomaly)")
    ap.add_argument("--row", nargs="+", metavar=("DIR", "ID"), help="a folder and chunk ids, left to right")
    ap.add_argument("--out", help="where gate.json goes")
    args = ap.parse_args(argv)
    if args.row:
        folder = here(args.row[0])
        grid = {cid: (i, 0) for i, cid in enumerate(args.row[1:])}
        images, blockouts = folder, None
        out = here(args.out) if args.out else ROOT / "tmp" / "gate" / f"{folder.parent.name}-{folder.name}.json"
        concept_path = args.concept
    elif args.zone:
        zone = here(args.zone)
        world = json.loads((zone / "world.json").read_text(encoding="utf-8"))
        grid = {cid: (c["col"], c["row"]) for cid, c in world["chunks"].items()}
        images = here(args.images) if args.images else zone / "images"
        blockouts = zone / "blockout"
        out = here(args.out) if args.out else zone / "previews" / "gate.json"
        concept_path = args.concept
        if not concept_path and (zone / "zone.json").exists():
            spec = json.loads((zone / "zone.json").read_text(encoding="utf-8")).get("concept", {})
            concept_path = spec.get("clean") or spec.get("anomaly")
    else:
        ap.error("give a zone folder or --row DIR ID ...")
    concept = load(here(concept_path)) if concept_path else None
    report = gate(grid, images, concept, blockouts, args.chunks)
    show(report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("wrote", out)
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
