"""Previews of a generated zone: the whole map, its 404 tears, and the concept beside it (docs/09 "World pipeline", stages 6 and 8).

    python scripts/world_preview.py map art/zones/<zone> [--scale 0.25] [--state clean|anomaly] [--collision] [--grid]
        the zone stitched from its chunks (images/ → blockout/ → a grey box with the id), 1620x540 for a 3x3 grid
        at 0.25; --state anomaly draws the tears from world.json; --collision overlays the collision files
        (walk red, oneWay orange, climb yellow, solid white outline, noGo blue hatch); --grid draws chunk borders
        and ids → previews/map-<state>[-collision].png

    python scripts/world_preview.py concept art/zones/<zone>
        the concept beside the zone map at the same height → previews/vs-concept.png (anomaly) and
        previews/vs-concept-clean.png (clean)

`--out DIR` writes somewhere else than art/zones/<zone>/previews/.

THE 404 AS DATA (stage 6). Chunks are always painted clean. world.json lists the tears,
{"kind": "cut"|"stretch", "chunk", "box": [x0, y0, x1, y1] in chunk px, "from" (stretch), "seed"}, and
`draw_tears` draws them as an fx overlay over the clean picture:

- cut: the box filled flat grey (TEAR_GREY, ±2 per 2x2 block and ±6 per 8 px row band by `block_hash`), its border torn – every 4 px
  step of each edge pushed in or out by 0–16 px (even, mostly small) – and a few rectangles cut out of it so
  the sky shows through;
- stretch: every 2 px column of the box takes the colours of the rows just above `from` (2–8 rows, per column)
  and smears them upward, opaque for the lower quarter of the streak and fading to nothing at its top, with a
  ragged length per column that follows its neighbour's (some columns empty).

Everything is on the game's 2 px grain, and all randomness comes from `Mulberry32(seed)` (plus the integer
`block_hash`), drawn in a fixed order, so the game can port it exactly (Math.imul for the multiplications).
How the game should draw it: once per chunk when it loads, build the tear overlay from the chunk's clean
picture at rest (all its plates composed, as `export_stage.py --verify` rebuilds it) with `tear_overlay`,
keep it as an RGBA texture in chunk px, and draw it at the chunk's origin with scroll 1.0 above every plate of
the chunk and below the characters – only in the anomaly state. Outside the box (+16 px for a cut) the overlay
is fully transparent, so the clean chunk shows unchanged.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CHUNK = (2160, 720)
GRAIN = 2            # the game's pixel grain
STEP = 4             # a torn edge moves in steps of 4 px
MARGIN = 16          # how far a torn edge may reach out of (or into) its box
BAND = 8             # the grey shifts a little every 8 rows, like the concept's dull cloud
TEAR_GREY = (120, 118, 125)
FADE = 0.25          # a streak is opaque for its lower quarter, then fades out
SOURCE_ROWS = (2, 8)  # a stretch column smears this many rows above `from`
NEUTRAL = (128, 128, 128)
GAP = 16
LABEL = 24
M32 = 0xFFFFFFFF
COLLISION = {"walk": (230, 40, 40), "oneWay": (255, 150, 30), "climb": (250, 220, 40), "solid": (255, 255, 255), "noGo": (60, 110, 255)}


class Mulberry32:
    """A tiny portable 32-bit PRNG: the same numbers in Python and TypeScript for the same seed."""

    def __init__(self, seed: int):
        self.state = seed & M32

    def __call__(self) -> float:
        """The next float in [0, 1)."""
        self.state = (self.state + 0x6D2B79F5) & M32
        t = self.state
        t = ((t ^ (t >> 15)) * (t | 1)) & M32
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296.0


def block_hash(bx: np.ndarray, by: np.ndarray, seed: int) -> np.ndarray:
    """An integer hash per 2x2 block (uint32), for the grey's dither."""
    h = (bx.astype(np.uint64) * 374761393 + by.astype(np.uint64) * 668265263 + (seed & M32) * 2246822519) & M32
    h = ((h ^ (h >> 13)) * 1274126177) & M32
    return (h ^ (h >> 16)).astype(np.uint32)


def even(v: float) -> int:
    """Snap to the 2 px grain."""
    return int(math.floor(v / GRAIN)) * GRAIN


def jitter(rnd: Mulberry32) -> int:
    """How far one 4 px step of a torn edge moves inward (+) or outward (−): 0–16 px, even, mostly small."""
    u = rnd()
    mag = GRAIN * round(MARGIN / GRAIN * u * u)
    return mag if rnd() < 0.5 else -mag


def tear_region(tear: dict) -> tuple[int, int, int, int]:
    """The chunk-px rectangle a tear's overlay covers (and reads, for a stretch)."""
    x0, y0, x1, y1 = (even(v) for v in tear["box"])
    if tear["kind"] == "cut":
        return x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN
    fy = even(tear.get("from", y1))
    return x0, min(y0, fy - SOURCE_ROWS[1]), x1, max(y1, fy)


def cut_overlay(src: np.ndarray, tear: dict, rx: int, ry: int) -> np.ndarray:
    """RGBA overlay of a cut over `src` (the region at chunk px, top-left at rx, ry): flat grey with torn edges."""
    h, w = src.shape[:2]
    x0, y0, x1, y1 = (even(v) for v in tear["box"])
    rnd = Mulberry32(tear["seed"])
    nx, ny = max(1, math.ceil((x1 - x0) / STEP)), max(1, math.ceil((y1 - y0) / STEP))
    top = np.array([y0 + jitter(rnd) for _ in range(nx)])
    bottom = np.array([y1 - jitter(rnd) for _ in range(nx)])
    left = np.array([x0 + jitter(rnd) for _ in range(ny)])
    right = np.array([x1 - jitter(rnd) for _ in range(ny)])
    xs, ys = np.arange(w) + rx, np.arange(h) + ry
    sx = np.clip((xs - x0) // STEP, 0, nx - 1)
    sy = np.clip((ys - y0) // STEP, 0, ny - 1)
    inside = (top[sx][None, :] <= ys[:, None]) & (ys[:, None] < bottom[sx][None, :])
    inside &= (left[sy][:, None] <= xs[None, :]) & (xs[None, :] < right[sy][:, None])
    for _ in range(2 + int(rnd() * 3)):  # sky showing through, mostly in the lower half
        cw, ch = GRAIN * (6 + int(rnd() * 24)), GRAIN * (3 + int(rnd() * 8))
        cx = x0 + even(rnd() * max(0, x1 - x0 - cw))
        cy = y0 + even((0.4 + 0.6 * rnd()) * max(0, y1 - y0 - ch))
        inside[max(0, cy - ry):max(0, cy + ch - ry), max(0, cx - rx):max(0, cx + cw - rx)] = False
    dither = (block_hash((xs // GRAIN)[None, :], (ys // GRAIN)[:, None], tear["seed"]) % 3).astype(np.int16) - 1
    band = (block_hash(np.zeros(1, np.int64)[None, :], (ys // BAND)[:, None], tear["seed"] + 1) % 5).astype(np.int16) - 2
    out = np.zeros((h, w, 4), np.uint8)
    for c in range(3):
        out[..., c] = np.clip(TEAR_GREY[c] + 2 * dither + 3 * band, 0, 255)
    out[..., 3] = np.where(inside, 255, 0)
    return out


def stretch_overlay(src: np.ndarray, tear: dict, rx: int, ry: int) -> np.ndarray:
    """RGBA overlay of a stretch: each 2 px column smears the rows above `from` upward, fading out, ragged."""
    h, w = src.shape[:2]
    x0, y0, x1, y1 = (even(v) for v in tear["box"])
    fy = min(even(tear.get("from", y1)), y1)
    out = np.zeros((h, w, 4), np.uint8)
    span = fy - y0
    if span <= 0:
        return out
    rnd = Mulberry32(tear["seed"])
    reach = 0.65
    for x in range(x0, x1, GRAIN):
        rows = SOURCE_ROWS[0] + GRAIN * int(rnd() * ((SOURCE_ROWS[1] - SOURCE_ROWS[0]) // GRAIN + 1))
        u, reach = rnd(), 0.5 * reach + 0.5 * (0.3 + 0.7 * rnd())  # neighbours reach about as high
        length = even(reach * span)
        if u < 0.1 or length <= 0:
            continue
        lx = x - rx
        if not 0 <= lx < w:
            continue
        for yb in range(fy - GRAIN, fy - length - 1, -GRAIN):
            t = (fy - GRAIN - yb) / length  # 0 at the source row, → 1 at the streak's top
            sy = fy - GRAIN - even(t * rows)
            alpha = 1.0 if t < FADE else (1.0 - t) / (1.0 - FADE)
            alpha = round(alpha * 4) / 4
            ly, lsy = yb - ry, sy - ry
            if alpha <= 0 or not (0 <= ly < h and 0 <= lsy < h):
                continue
            colour = src[lsy, lx, :3]
            out[ly:ly + GRAIN, lx:lx + GRAIN, :3] = colour
            out[ly:ly + GRAIN, lx:lx + GRAIN, 3] = int(255 * alpha)
    return out


def tear_overlay(src: np.ndarray, tear: dict, rx: int, ry: int) -> np.ndarray:
    """The tear's RGBA overlay over its region (see `tear_region`), from the clean pixels of that region."""
    return (cut_overlay if tear["kind"] == "cut" else stretch_overlay)(src, tear, rx, ry)


def draw_tears(image: Image.Image, tears: list[dict], origin: tuple[float, float] = (0, 0), scale: float = 1.0) -> Image.Image:
    """The image with the 404 tears drawn over it; chunk px (x, y) is image px origin + (x, y) * scale."""
    out = image.convert("RGBA")
    for tear in tears:
        rx0, ry0, rx1, ry1 = tear_region(tear)
        ix0, iy0 = round(origin[0] + rx0 * scale), round(origin[1] + ry0 * scale)
        ix1, iy1 = round(origin[0] + rx1 * scale), round(origin[1] + ry1 * scale)
        if ix1 <= ix0 or iy1 <= iy0:
            continue
        patch = out.crop((ix0, iy0, ix1, iy1))
        if patch.size != (rx1 - rx0, ry1 - ry0):
            patch = patch.resize((rx1 - rx0, ry1 - ry0), Image.Resampling.NEAREST)
        overlay = Image.fromarray(tear_overlay(np.asarray(patch), tear, rx0, ry0))
        if overlay.size != (ix1 - ix0, iy1 - iy0):
            overlay = overlay.resize((ix1 - ix0, iy1 - iy0), Image.Resampling.NEAREST)
        layer = Image.new("RGBA", out.size, (0, 0, 0, 0))
        layer.paste(overlay, (ix0, iy0))
        out = Image.alpha_composite(out, layer)
    return out.convert(image.mode) if image.mode in ("RGB", "RGBA") else out


def load_world(zone: Path) -> dict:
    """world.json of a zone folder."""
    return json.loads((zone / "world.json").read_text(encoding="utf-8"))


def chunk_image(zone: Path, cid: str, size: tuple[int, int]) -> Image.Image:
    """The painted chunk, else its blockout, else a neutral grey box with the id."""
    for folder in ("images", "blockout"):
        path = zone / folder / f"{cid}.png"
        if path.exists():
            image = Image.open(path).convert("RGB")
            return image if image.size == size else image.resize(size, Image.Resampling.LANCZOS)
    image = Image.new("RGB", size, NEUTRAL)
    ImageDraw.Draw(image).text((size[0] // 2, size[1] // 2), cid, fill=(40, 40, 40), anchor="mm", font=font(max(10, size[1] // 12)))
    return image


def font(size: int) -> ImageFont.ImageFont:
    """The default font at a size (bitmap fallback without FreeType)."""
    try:
        return ImageFont.load_default(size)
    except (TypeError, OSError):
        return ImageFont.load_default()


def edges(n: int, cell: int, scale: float) -> list[int]:
    """Scaled chunk edges along one axis, rounded so neighbours touch."""
    return [round(i * cell * scale) for i in range(n + 1)]


def render_map(zone: Path, scale: float = 0.25, state: str = "clean", collision: bool = False, grid: bool = False) -> Image.Image:
    """The whole zone stitched from its chunks at `scale`, with tears, collision and grid as asked."""
    world = load_world(zone)
    cw, ch = world.get("chunk", CHUNK)
    cols, rows = world["grid"]
    xs, ys = edges(cols, cw, scale), edges(rows, ch, scale)
    out = Image.new("RGB", (xs[-1], ys[-1]), (0, 0, 0))
    tears = world.get("anomaly", {}).get("tears", []) if state == "anomaly" else []
    for cid, info in world["chunks"].items():
        c, r = info["col"], info["row"]
        image = chunk_image(zone, cid, (cw, ch))
        mine = [t for t in tears if t["chunk"] == cid]
        if mine:
            image = draw_tears(image, mine)
        out.paste(image.resize((xs[c + 1] - xs[c], ys[r + 1] - ys[r]), Image.Resampling.BOX), (xs[c], ys[r]))
    if collision:
        draw_collision(out, zone, world, scale)
    if grid:
        draw_grid(out, world, xs, ys)
    return out


def draw_collision(out: Image.Image, zone: Path, world: dict, scale: float) -> None:
    """Overlay every chunk's collision file at its zone coordinates."""
    cw, ch = world.get("chunk", CHUNK)
    draw = ImageDraw.Draw(out)
    width = max(1, round(8 * scale))
    for cid, info in world["chunks"].items():
        path = zone / "collision" / f"{cid}.collision.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        ox, oy = info["col"] * cw, info["row"] * ch

        def at(x: float, y: float) -> tuple[int, int]:
            return round((ox + x) * scale), round((oy + y) * scale)

        def rect(b: dict) -> tuple[int, int, int, int]:
            (a, b0), (c, d) = at(b["x"], b["y"]), at(b["x"] + b["w"], b["y"] + b["h"])
            return a, b0, max(a, c - 1), max(b0, d - 1)

        for b in data.get("noGo", []):
            hatch(out, rect(b), COLLISION["noGo"])
        for b in data.get("solid", []):
            draw.rectangle(rect(b), outline=COLLISION["solid"], width=width)
        for b in data.get("climb", []):
            draw.rectangle(rect(b), outline=COLLISION["climb"], width=width)
        for kind in ("oneWay", "walk"):
            for line in data.get(kind, []):
                points = [at(x, y) for x, y in line]
                if len(points) > 1:
                    draw.line(points, fill=COLLISION[kind], width=width)
                elif points:
                    draw.point(points, fill=COLLISION[kind])


def hatch(out: Image.Image, box: tuple[int, int, int, int], colour: tuple[int, int, int], step: int = 6) -> None:
    """Diagonal hatch and an outline inside a box."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    for k in range(-h, w, step):
        draw.line([(k, h), (k + h, 0)], fill=colour + (200,), width=1)
    draw.rectangle((0, 0, w - 1, h - 1), outline=colour + (255,))
    out.paste(tile, (x0, y0), tile)


def draw_grid(out: Image.Image, world: dict, xs: list[int], ys: list[int]) -> None:
    """Thin chunk borders and each chunk's id."""
    draw = ImageDraw.Draw(out)
    for x in xs[1:-1]:
        draw.line([(x, 0), (x, out.height)], fill=(255, 0, 255))
    for y in ys[1:-1]:
        draw.line([(0, y), (out.width, y)], fill=(255, 0, 255))
    small = font(12)
    for cid, info in world["chunks"].items():
        x, y = xs[info["col"]] + 4, ys[info["row"]] + 3
        label = f"{cid} {info.get('band', '')}".strip()
        draw.text((x + 1, y + 1), label, fill=(0, 0, 0), font=small)
        draw.text((x, y), label, fill=(255, 0, 255), font=small)


def side_by_side(concept: Image.Image, zone_map: Image.Image, labels: tuple[str, str]) -> Image.Image:
    """The concept scaled to the map's height, a gap, the map; a label over each."""
    h = zone_map.height
    concept = concept.convert("RGB").resize((round(concept.width * h / concept.height), h), Image.Resampling.LANCZOS)
    out = Image.new("RGB", (concept.width + GAP + zone_map.width, LABEL + h), (20, 20, 24))
    out.paste(concept, (0, LABEL))
    out.paste(zone_map.convert("RGB"), (concept.width + GAP, LABEL))
    draw = ImageDraw.Draw(out)
    small = font(14)
    draw.text((4, 4), labels[0], fill=(230, 230, 230), font=small)
    draw.text((concept.width + GAP + 4, 4), labels[1], fill=(230, 230, 230), font=small)
    return out


def render_concept(zone: Path, state: str, scale: float = 0.25) -> Image.Image:
    """The zone's concept for a state beside its map in that state."""
    spec = json.loads((zone / "zone.json").read_text(encoding="utf-8"))
    world = load_world(zone)
    concept = Image.open(ROOT / spec["concept"][state])
    return side_by_side(concept, render_map(zone, scale, state), ("concept", f"zone (seed {world.get('seed', '?')})"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="step", required=True)
    m = sub.add_parser("map", help="the zone stitched from its chunks")
    m.add_argument("zone", type=Path)
    m.add_argument("--scale", type=float, default=0.25)
    m.add_argument("--state", choices=("clean", "anomaly"), default="clean")
    m.add_argument("--collision", action="store_true")
    m.add_argument("--grid", action="store_true")
    m.add_argument("--out", type=Path)
    c = sub.add_parser("concept", help="the zone map beside its concept")
    c.add_argument("zone", type=Path)
    c.add_argument("--scale", type=float, default=0.25)
    c.add_argument("--out", type=Path)
    args = parser.parse_args()
    zone = ROOT / args.zone
    out_dir = (ROOT / args.out) if args.out else zone / "previews"
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.step == "map":
        name = f"map-{args.state}{'-collision' if args.collision else ''}.png"
        render_map(zone, args.scale, args.state, args.collision, args.grid).save(out_dir / name)
        print(out_dir / name)
    else:
        for state, name in (("anomaly", "vs-concept.png"), ("clean", "vs-concept-clean.png")):
            render_concept(zone, state, args.scale).save(out_dir / name)
            print(out_dir / name)


if __name__ == "__main__":
    main()
