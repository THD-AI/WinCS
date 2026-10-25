"""World pipeline stages 2–3: paint every chunk over its blockout, then join every seam in four directions (docs/09).

    python scripts/world_paint.py paint art/zones/<zone> [ids …] [--redo]
    python scripts/world_paint.py grow  art/zones/<zone> <source> <up|down> <new>
    python scripts/world_paint.py join  art/zones/<zone> [--only left-right|up-down] [--row N]
    python scripts/world_paint.py feature art/zones/<zone> <id> --box x0,y0,x1,y1 --brief "…"   # a story detail
    python scripts/world_paint.py settle art/zones/<zone> --row N [--up] # up/down seams: colour only
    python scripts/world_paint.py join  art/zones/<zone> --only up-down --pair a,b --half 150,44 --brief "…"
                                                                         # the window stops 44 rows into b
    python scripts/world_paint.py join  art/zones/<zone> --only left-right --pair a,b --half 480,160 --brief "…"
                                                                         # two different rooms: paint the passage
    python scripts/world_paint.py accept art/zones/<zone> [ids …]

paint – the model edits each chunk's flat guide (blockout/<id>.png) under a fully open mask, so the walk lines,
ladders, water and rooms stay where the blockout put them; the zone's look reference (zone.json "inputs", never
a picture of the zone itself) comes along as the LOOK only. The first chunk at pond level is painted alone and then goes with every other chunk as the palette
anchor, so the zone is one place. Chunks after the anchor are painted in parallel.
join – one 2160×720 canvas per seam: the two halves that meet, the window across the seam repainted, then joined
back to the old art along min-error cuts on both sides (grow_stage.min_cut). Left/right seams first, then up/down
seams on the result, each set in parallel (their windows never overlap).
accept – copy the joined chunks to images/ after the artifact gate passed.

Raw output stays in tmp/zones/<zone>/ (paint/, join/). Needs OPENAI_API_KEY (a header file, make_boards.edit).
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_boards as mb  # noqa: E402
from grow_stage import min_cut  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
W, H = 2160, 720
HALF = 160      # a left/right join repaints this far on each side of the seam
BAND = 110      # an up/down join repaints this many rows on each side of the seam

PAINT = (
    "The first image is a flat LAYOUT GUIDE for one 2160x720 chunk of a side-scrolling stage. Paint it as the "
    "finished chunk, keeping every shape exactly where the guide puts it: red lines are the tops of walkable "
    "surfaces - the path, a deck or a girder's top edge lies exactly there; brown is earth and stone; blue is "
    "water; grey bars are rusty girders and posts; yellow strips are ladders; purple rooms are lit hollows you can "
    "walk into; the pale blue is open air for sky, far trees and mid trees. Never draw the guide's flat colours, "
    "its lines or its hard rectangle edges: everything becomes natural, overgrown, painted scenery. The layout comes "
    "ONLY from the guide: where the guide is open air, paint open air - do not add girders, platforms, ponds or "
    "rooms the guide does not have. The second image is the zone's look reference (zone.json \"inputs\"): the LOOK only - "
    "palette, light, materials, the fine 2-pixel grain - never its content, layout or scale. "
    "{anchor}\n\nWHAT IS HERE: {brief}")
ANCHOR = ("The last image is a neighbouring chunk of the same zone, already painted: the same palette, light, grain "
          "and level of detail, so the two read as one place.")

JOIN = ("This image shows two neighbouring chunks of a side-scrolling stage meeting {where}. Repaint ONLY the "
        "transparent window across the join so the two sides become one continuous place: the sky, the trees, the "
        "girders, the ground, the water and the light run through without a break, a cut, a line or a colour step, "
        "in the same palette, fine 2-pixel grain and scale. Keep every walkable edge, ladder and girder exactly "
        "where it is. Strict side view, no characters, no text.")
TRANSITION = ("THE PASSAGE: the left side and the right side are different rooms. Across the whole window, paint "
              "the place where one turns into the other, gradually, as a built thing you could walk through: "
              "{brief}")


def load(zone_dir: Path) -> tuple[dict, dict, Path]:
    zone = json.loads((zone_dir / "zone.json").read_text(encoding="utf-8"))
    world = json.loads((zone_dir / "world.json").read_text(encoding="utf-8"))
    raw = ROOT / "tmp" / "zones" / zone["zone"]
    return zone, world, raw


def anchor_of(world: dict) -> str:
    """The first chunk at pond level: where the zone starts, painted first."""
    level = [c for c in world["chunks"].values() if c["band"] == "level"]
    return min(level, key=lambda c: (c["col"], c["row"]))["id"]


def call(name: str, prompt: str, base: Image.Image, mask: Image.Image, refs: list[str], zone: dict,
         extra: list[Path] = ()) -> Image.Image | None:
    """One edit call: base is the canvas, mask's transparent pixels are painted."""
    with tempfile.TemporaryDirectory() as folder:
        b, m = Path(folder) / "base.png", Path(folder) / "mask.png"
        base.convert("RGB").save(b)
        mask.save(m)
        images = [b, *(mb.load_ref(r, Path(folder)) for r in refs), *extra]
        png = mb.edit(name, {"model": zone["model"], "prompt": prompt, "size": f"{W}x{H}"}, images, mb.api_key(), mask=m)
    return None if png is None else Image.open(io.BytesIO(png)).convert("RGB").resize((W, H), Image.LANCZOS)


def paint_one(zone_dir: Path, zone: dict, world: dict, raw: Path, cid: str, anchor: Path | None) -> str:
    chunk = world["chunks"][cid]
    guide = Image.open(zone_dir / "blockout" / f"{cid}.png").convert("RGB")
    prompt = "\n\n".join([PAINT.format(anchor=ANCHOR if anchor else "", brief=chunk["brief"]), zone["style"],
                          zone["people"]])
    out = call(f"{cid} paint", prompt, guide, Image.new("RGBA", (W, H)), zone["inputs"][:1], zone,
               [anchor] if anchor else [])
    if out is None:
        return f"{cid}: FAILED"
    out.save(raw / "paint" / f"{cid}.png")
    return f"{cid}: painted"


def paint(zone_dir: Path, ids: list[str], redo: bool) -> None:
    zone, world, raw = load(zone_dir)
    (raw / "paint").mkdir(parents=True, exist_ok=True)
    first = anchor_of(world)
    todo = [c for c in (ids or world["chunks"]) if redo or not (raw / "paint" / f"{c}.png").exists()]
    if first in todo:
        print(paint_one(zone_dir, zone, world, raw, first, None), flush=True)
        todo.remove(first)
    anchor = raw / "paint" / f"{first}.png"
    with ThreadPoolExecutor(max_workers=5) as pool:
        for line in pool.map(lambda c: paint_one(zone_dir, zone, world, raw, c, anchor), todo):
            print(line, flush=True)


PIECES_V = (480, 240)  # growing up or down: rows painted per call; the rest of the 720-row canvas is known art
OVERLAP_V = 128        # the later piece also paints this many rows over the earlier one; a min-error cut joins them


def grow_vertical(neighbour: Image.Image, guide: Image.Image, up: bool, painter) -> Image.Image:
    """A new chunk above (up) or below the neighbour, grown from its edge like grow_stage grows sideways.

    Two calls on a 2160x720 canvas: first 480 rows of the new chunk next to 240 rows of the neighbour, then the
    last 240 rows (plus 128 over the first piece) next to 480 rows of finished art. The neighbour is never
    repainted; the two pieces meet on a min-error cut through the overlap rows; the seam's colours are matched.
    `painter(canvas, mask)` returns the painted canvas (mask: transparent = paint); it always sees the canvas the
    right way up. The bookkeeping below runs as if growing up – growing down flips the stack, not the painter's view."""
    flip = (lambda im: im) if up else (lambda im: im.transpose(Image.Transpose.FLIP_TOP_BOTTOM))
    tall = Image.new("RGB", (W, 2 * H))
    tall.paste(flip(guide.convert("RGB")), (0, 0))
    tall.paste(flip(neighbour.convert("RGB")), (0, H))
    done = 0
    for n, piece in enumerate(PIECES_V):
        overlap = OVERLAP_V if n else 0
        top = H - done - piece
        canvas = tall.crop((0, top, W, top + H))
        mask = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        mask.paste((0, 0, 0, 0), (0, 0, W, piece + overlap))
        painted = flip(painter(flip(canvas), flip(mask)).convert("RGB").resize((W, H)))
        out = canvas.copy()
        out.paste(painted.crop((0, 0, W, piece)), (0, 0))
        if overlap:  # rows piece..piece+overlap: the new painting above the cut, the earlier piece below it
            new = painted.crop((0, piece, W, piece + overlap)).transpose(Image.Transpose.TRANSPOSE)
            old = canvas.crop((0, piece, W, piece + overlap)).transpose(Image.Transpose.TRANSPOSE)
            cut = min_cut(new, old)
            o, s = out.load(), painted.load()
            for x, c in enumerate(cut):
                for y in range(piece, piece + c):
                    o[x, y] = s[x, y]
        tall.paste(out, (0, top))
        done += piece
    new = match_rows(tall.crop((0, 0, W, H)), tall.crop((0, H, W, 2 * H)), median=31)  # no streaks from a leaf
    return flip(new)


def match_rows(new: Image.Image, below: Image.Image, ramp: int = 160, blur: int = 9, median: int = 0) -> Image.Image:
    """Shift the new chunk's colours near its bottom row so it meets the top row of the art below it, fading out
    over `ramp` rows (grow_stage.match_seam, turned on its side). Shapes are untouched. `median` takes each
    column's step as the median over that many columns around it: the colour drift is matched, but a leaf or a
    cloud edge that only one side has is not smeared up the ramp as a streak."""
    import numpy as np
    a, b = np.asarray(new, dtype=np.float32), np.asarray(below, dtype=np.float32)
    step = b[0] - a[-1]                                     # per column, per channel
    if median:
        # A cloud or a leaf on one side only is a shape, not a colour drift: its columns step far more than the
        # rest. Unless most columns do, they take the drift interpolated from the columns around them.
        size = np.abs(step).sum(1)
        odd = size > max(3 * np.median(size), 24)
        if 0 < odd.sum() < 0.5 * len(odd):
            xs = np.arange(len(odd))
            step = np.stack([np.interp(xs, xs[~odd], step[~odd, c]) for c in range(3)], 1)
        h = median // 2
        padded = np.pad(step, ((h, h), (0, 0)), mode="edge")
        step = np.median(np.lib.stride_tricks.sliding_window_view(padded, median, axis=0), axis=-1)
    k = np.ones(2 * blur + 1, dtype=np.float32) / (2 * blur + 1)
    step = np.stack([np.convolve(np.pad(step[:, c], blur, mode="edge"), k, mode="valid") for c in range(3)], 1)
    weight = np.clip(1 - np.arange(ramp, dtype=np.float32)[::-1] / ramp, 0, 1)  # 1 at the seam, 0 `ramp` rows up
    a[-ramp:] += weight[:, None, None] * step[None]
    return Image.fromarray(np.clip(np.rint(a), 0, 255).astype(np.uint8))


def grow(zone_dir: Path, source: str, direction: str, new: str) -> None:
    """Grow chunk `new` above or below `source` (painted or approved) over its blockout guide."""
    zone, world, raw = load(zone_dir)
    (raw / "grow").mkdir(parents=True, exist_ok=True)
    src = next(p for p in (raw / "join" / f"{source}.png", raw / "grow" / f"{source}.png",
                           zone_dir / "images" / f"{source}.png") if p.exists())
    guide = Image.open(zone_dir / "blockout" / f"{new}.png")
    where = "above" if direction == "up" else "below"
    prompt = "\n\n".join([GROW.format(edge="bottom" if direction == "up" else "top", where=where,
                                      brief=world["chunks"][new]["brief"]), zone["style"], zone["people"]])
    calls = iter(range(1, 3))

    def painter(canvas: Image.Image, mask: Image.Image) -> Image.Image:
        n = next(calls)
        done, seen = raw / "grow" / f"{new}--piece-{n}.png", raw / "grow" / f"{new}--canvas-{n}.png"
        asked = raw / "grow" / f"{new}--prompt-{n}.txt"
        if done.exists() and seen.exists() and asked.exists() and asked.read_text(encoding="utf-8") == prompt \
                and Image.open(seen).convert("RGB").tobytes() == canvas.convert("RGB").tobytes():
            return Image.open(done)  # a run cut short (a timeout) resumes: the same canvas and prompt were painted
        canvas.save(seen)
        asked.write_text(prompt, encoding="utf-8")
        out = call(f"{new} piece {n}", prompt, canvas, mask, zone["inputs"], zone)
        if out is None:
            sys.exit(1)
        out.save(raw / "grow" / f"{new}--piece-{n}.png")
        return out

    out = grow_vertical(Image.open(src), guide, direction == "up", painter)
    out.save(raw / "grow" / f"{new}.png")
    print(f"{new}: grown {direction} from {source} -> {(raw / 'grow' / (new + '.png')).relative_to(ROOT)}")


GROW = ("This image is part of a side-scrolling stage explored up and down. The finished art along its {edge} edge "
        "must stay exactly as it is. Paint the rest - where a flat LAYOUT GUIDE is drawn - as the part of the stage "
        "directly {where} that art, one continuous place: the light, the palette, the fine 2-pixel grain and the "
        "scale continue without a break. Follow the guide exactly: red lines are the tops of walkable surfaces, "
        "brown is earth and stone, blue is water, grey bars are rusty girders, yellow strips are ladders, purple "
        "rooms are lit hollows you can walk into, pale blue is open air. Never draw the guide's flat colours or "
        "lines. Strict side view. No characters, no text.\n\nWHAT IS HERE: {brief}")


def window_mask(size: tuple[int, int], box: tuple[int, int, int, int]) -> Image.Image:
    """Opaque everywhere but the box (transparent = paint)."""
    mask = Image.new("RGBA", size, (0, 0, 0, 255))
    mask.paste((0, 0, 0, 0), box)
    return mask


def seams(world: dict) -> dict[str, list[tuple[str, str]]]:
    """Every pair of grid neighbours: left/right and up/down."""
    at = {(c["col"], c["row"]): c["id"] for c in world["chunks"].values()}
    lr = [(a, at[(col + 1, row)]) for (col, row), a in at.items() if (col + 1, row) in at]
    ud = [(a, at[(col, row + 1)]) for (col, row), a in at.items() if (col, row + 1) in at]
    return {"left-right": sorted(lr), "up-down": sorted(ud)}


def cut_back(old: Image.Image, new: Image.Image, start: int, end: int, vertical_seam: bool) -> Image.Image:
    """Keep `new` between two min-error cuts inside its margins: start..start+m and end-m..end along the axis across
    the seam (columns for a left/right seam, rows for an up/down one)."""
    if not vertical_seam:  # rows across the seam: transpose, cut as columns, transpose back
        t = cut_back(old.transpose(Image.Transpose.TRANSPOSE), new.transpose(Image.Transpose.TRANSPOSE), start, end, True)
        return t.transpose(Image.Transpose.TRANSPOSE)
    m = 48
    h = old.height
    left = min_cut(new.crop((start, 0, start + m, h)), old.crop((start, 0, start + m, h)))
    right = min_cut(old.crop((end - m, 0, end, h)), new.crop((end - m, 0, end, h)))
    out = old.copy()
    o, s = out.load(), new.load()
    for y in range(h):
        for x in range(start + left[y], end - m + right[y]):
            o[x, y] = s[x, y]
    return out


def join_one(zone: dict, a: Image.Image, b: Image.Image, kind: str, name: str, half: int | tuple[int, int] = HALF,
             brief: str | None = None, here: str | None = None) -> tuple[Image.Image, Image.Image] | None:
    """Repaint the window across one seam; returns the two chunks with it joined in. Where two rooms of a
    different nature meet, a wider window (`half`, or (left, right) to lean the passage into the chunk that has
    room for it) and a `brief` paint the passage from one into the other. `here`
    is the world brief of the place, so a window in open sky is painted as sky, not as a picture of its own."""
    if kind == "left-right":
        canvas = Image.new("RGB", (W, H))
        canvas.paste(a.crop((W // 2, 0, W, H)), (0, 0))
        canvas.paste(b.crop((0, 0, W // 2, H)), (W // 2, 0))
        left, right = half if isinstance(half, tuple) else (half, half)
        box, where = (W // 2 - left, 0, W // 2 + right, H), "in the middle, left and right"
    else:
        canvas = Image.new("RGB", (W, H))
        canvas.paste(a.crop((0, H // 2, W, H)), (0, 0))
        canvas.paste(b.crop((0, 0, W, H // 2)), (0, H // 2))
        # (above, below) keeps the window off something below that must not move (a railway girder's top edge)
        above, below = half if isinstance(half, tuple) else (BAND, BAND)
        box, where = (0, H // 2 - above, W, H // 2 + below), "along a horizontal line across the middle, above and below"
    parts = [JOIN.format(where=where)] + ([TRANSITION.format(brief=brief)] if brief else []) +         ([f"WHAT IS HERE: {here}"] if here else [])
    prompt = "\n\n".join(parts + [zone["style"], zone["people"]])
    painted = call(name, prompt, canvas, window_mask((W, H), box), zone["inputs"][:1], zone)
    if painted is None:
        return None
    joined = cut_back(canvas, painted, box[0], box[2], True) if kind == "left-right" else \
        cut_back(canvas, painted, box[1], box[3], False)
    a, b = a.copy(), b.copy()
    if kind == "left-right":
        a.paste(joined.crop((0, 0, W // 2, H)), (W // 2, 0))
        b.paste(joined.crop((W // 2, 0, W, H)), (0, 0))
    else:
        a.paste(joined.crop((0, 0, W, H // 2)), (0, H // 2))
        b.paste(joined.crop((0, H // 2, W, H)), (0, 0))
    return a, b


def latest(zone_dir: Path, raw: Path, cid: str) -> Path:
    """The newest version of a chunk: joined, grown, painted, or the approved image."""
    return next(p for p in (raw / "join" / f"{cid}.png", raw / "grow" / f"{cid}.png", raw / "paint" / f"{cid}.png",
                            zone_dir / "images" / f"{cid}.png") if p.exists())


def place(world: dict, a: str, b: str) -> str | None:
    """The world brief shared by two neighbours of one band (None across bands: the seam is where they differ)."""
    ca, cb = world["chunks"][a], world["chunks"][b]
    return ca.get("brief") if ca["band"] == cb["band"] and ca.get("brief") == cb.get("brief") else None


def join(zone_dir: Path, only: str | None, row: int | None = None, pair: tuple[str, str] | None = None,
         half: int | tuple[int, int] = HALF, brief: str | None = None) -> None:
    zone, world, raw = load(zone_dir)
    (raw / "join").mkdir(parents=True, exist_ok=True)
    for kind, pairs in seams(world).items():
        if only and kind != only:
            continue
        if row is not None:
            pairs = [p for p in pairs if world["chunks"][p[0]]["row"] == row and world["chunks"][p[1]]["row"] == row]
        if pair:
            pairs = [p for p in pairs if p == pair]
        art = {c: Image.open(latest(zone_dir, raw, c)).convert("RGB") for c in world["chunks"]}
        # a chunk takes part in two seams of one kind (its two sides); their windows never overlap, so each
        # seam is painted on the same input art and its half pasted back into the chunk afterwards
        with ThreadPoolExecutor(max_workers=6) as pool:
            done = list(pool.map(lambda p: (p, join_one(zone, art[p[0]], art[p[1]], kind, f"{p[0]}|{p[1]} join",
                                                        half, brief, place(world, *p))), pairs))
        out = {c: img.copy() for c, img in art.items()}
        for (a, b), result in done:
            if result is None:
                print(f"{a}|{b}: FAILED, seam left as painted")
                continue
            ja, jb = result
            if kind == "left-right":
                out[a].paste(ja.crop((W // 2, 0, W, H)), (W // 2, 0))
                out[b].paste(jb.crop((0, 0, W // 2, H)), (0, 0))
            else:
                out[a].paste(ja.crop((0, H // 2, W, H)), (0, H // 2))
                out[b].paste(jb.crop((0, 0, W, H // 2)), (0, 0))
            print(f"{a}|{b}: joined ({kind})", flush=True)
        touched = {c for pair, result in done if result for c in pair}
        for c in touched:
            out[c].save(raw / "join" / f"{c}.png")


FEATURE = ("This image is one chunk of a side-scrolling stage. Change ONLY the transparent window: {brief} Everything "
           "outside the window stays exactly as it is and the window joins it seamlessly – the same light, palette, "
           "fine 2-pixel grain and scale. Strict side view, no people, no text.")


def feature(zone_dir: Path, cid: str, box: tuple[int, int, int, int], brief: str) -> None:
    """Repaint one window of a chunk with a story detail, the model seeing the art under the window (not a guide),
    joined back on min-error cuts across its left and right margins (48 px)."""
    zone, world, raw = load(zone_dir)
    art = Image.open(latest(zone_dir, raw, cid)).convert("RGB")
    prompt = "\n\n".join([FEATURE.format(brief=brief), zone["style"], zone["people"]])
    x0, y0, x1, y1 = box
    painted = call(f"{cid} feature", prompt, art, window_mask((W, H), box), zone["inputs"], zone)
    if painted is None:
        sys.exit(1)
    painted.save(raw / f"{cid}--feature-raw.png")
    window = painted.crop(box).convert("L")
    if sum(1 for v in window.getdata() if v == 0) > 0.5 * window.width * window.height:
        sys.exit(f"{cid}: the model left the window empty (black) – try again; nothing changed")
    band = cut_back(art.crop((0, y0, W, y1)), painted.crop((0, y0, W, y1)), x0, x1, True)
    out = art.copy()
    out.paste(band, (0, y0))
    (raw / "join").mkdir(parents=True, exist_ok=True)
    out.save(raw / "join" / f"{cid}.png")
    print(f"{cid}: feature painted in {box}")


def settle(zone_dir: Path, row: int, ramp: int = 48, up: bool = False) -> None:
    """Fade each chunk of `row` into the exact bottom edge of the chunk above it (match_rows per pixel, over `ramp`
    rows): what is left of an up/down seam after growing and joining is colour, never shape. `up` fades the row's
    bottom edge into the top edge of the chunk below instead – for a band grown above a row that must not change."""
    zone, world, raw = load(zone_dir)
    flip = Image.Transpose.FLIP_TOP_BOTTOM
    at = {(c["col"], c["row"]): cid for cid, c in world["chunks"].items()}
    (raw / "join").mkdir(parents=True, exist_ok=True)
    step = 1 if up else -1
    for (col, r), cid in at.items():
        if r != row or (col, r + step) not in at:
            continue
        moved = Image.open(latest(zone_dir, raw, cid)).convert("RGB")
        fixed = Image.open(latest(zone_dir, raw, at[(col, r + step)])).convert("RGB")
        settled = match_rows(moved, fixed, ramp=ramp, blur=0, median=31) if up else \
            match_rows(moved.transpose(flip), fixed.transpose(flip), ramp=ramp, blur=0).transpose(flip)
        settled.save(raw / "join" / f"{cid}.png")
        print(f"{cid}: settled into {at[(col, r + step)]}")


def accept(zone_dir: Path, ids: list[str]) -> None:
    zone, world, raw = load(zone_dir)
    (zone_dir / "images").mkdir(exist_ok=True)
    for c in ids or world["chunks"]:
        src = latest(zone_dir, raw, c)
        if src != zone_dir / "images" / f"{c}.png":
            shutil.copy(src, zone_dir / "images" / f"{c}.png")
        print(f"{c}: accepted -> images/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=["paint", "grow", "join", "settle", "feature", "accept"])
    parser.add_argument("zone", type=Path)
    parser.add_argument("ids", nargs="*")
    parser.add_argument("--redo", action="store_true")
    parser.add_argument("--only", choices=["left-right", "up-down"])
    parser.add_argument("--row", type=int, help="join only the seams inside this grid row")
    parser.add_argument("--box", help="feature: x0,y0,x1,y1 in chunk px")
    parser.add_argument("--brief", help="feature: what to paint in the window; join: the passage between two rooms")
    parser.add_argument("--pair", help="join: only this seam, a,b")
    parser.add_argument("--half", default=str(HALF), help="join: px repainted on each side of a left/right seam, "
                                                          "or left,right; an up/down seam takes above,below")
    parser.add_argument("--up", action="store_true", help="settle: fade the row into the chunk below it")
    args = parser.parse_args()
    zone = args.zone if args.zone.is_absolute() else ROOT / args.zone
    if args.step == "paint":
        paint(zone, args.ids, args.redo)
    elif args.step == "grow":  # ids: <source> <up|down> <new>
        grow(zone, *args.ids)
    elif args.step == "feature":
        feature(zone, args.ids[0], tuple(int(v) for v in args.box.split(",")), args.brief)
    elif args.step == "settle":
        settle(zone, args.row if args.row is not None else 1, up=args.up)
    elif args.step == "join":
        join(zone, args.only, args.row, tuple(args.pair.split(",")) if args.pair else None, tuple(int(v) for v in args.half.split(",")) if "," in args.half else int(args.half), args.brief)
    else:
        accept(zone, args.ids)


if __name__ == "__main__":
    main()
