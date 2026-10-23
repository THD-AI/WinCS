"""Export an approved sprite board as a Phaser atlas for the game (docs/13 §5).

    art/sprites/images/<board>.png   crushed 1x board, transparent (make_boards.py crush)
      + "atlas" in art/sprites/boards.json: game height and the animations per row
      -> game/public/assets/sprites/<board>.png         frames packed one animation per row
      -> game/public/assets/sprites/<board>.json        Phaser JSON hash, frames <anim>-<nn>
      -> game/public/assets/sprites/<board>.anims.json  {"walk": {"frames": 8, "fps": 12, "loop": true}}

Slicing: the board's rows are bands of opaque pixels separated by empty lines; inside a row,
frames are column runs separated by empty columns. Specks below 2 % of a row's biggest frame are
dropped. Every row must hold exactly the frames its config lists, or the export stops.

Scaling: one factor per board, so the tallest frame of the first animation becomes `height` game
pixels (hero: 76, in an 80 px frame). Each frame keeps its height above the row's ground line, so
the feet of every frame land on the bottom row of its cell and jumps stay in the air. The pivot is
(0.5, 1), centred on the feet (the opaque pixels in the lowest tenth of the sprite).

Config, per board:
    "atlas": {"height": 76, "rows": [
        [{"anim": "idle", "frames": 6}],
        [{"anim": "walk", "frames": 8}, {"anim": "jump", "frames": 9, "loop": false, "fps": 10}],
        "skip"]}

Usage:
    python scripts/export_atlas.py hero-move [more ids] [--config …] [--out …] [--preview]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "art" / "sprites" / "boards.json"
OUT = ROOT / "game" / "public" / "assets" / "sprites"
PREVIEW = ROOT / "tmp" / "atlas"
PAPER = (232, 228, 220)
FPS = 12
GAP = 4         # empty lines that separate two rows or two frames on the 1x board
SPECK = 0.02    # runs lighter than this share of the row's heaviest frame are noise
PAD_TOP = 4     # head room above the tallest frame (hero: 76 + 4 = 80 px cell)
SPACING = 2     # transparent pixels between cells, so filtering never bleeds


class AtlasError(Exception):
    """The board does not match its config; the message says where."""


def runs(filled: list[int], gap: int) -> list[tuple[int, int, int]]:
    """(start, end, mass) of the stretches of nonzero counts, joining holes narrower than `gap`."""
    found: list[list[int]] = []
    for i, count in enumerate(filled):
        if not count:
            continue
        if found and i - found[-1][1] <= gap:
            found[-1][1] = i + 1
            found[-1][2] += count
        else:
            found.append([i, i + 1, count])
    return [tuple(r) for r in found]


def solid(alpha: Image.Image) -> Image.Image:
    return alpha.point(lambda a: 255 if a >= 128 else 0)


def bands(image: Image.Image) -> list[tuple[int, int]]:
    """Rows of the board: (top, ground) of each band of opaque pixels."""
    alpha = solid(image.getchannel("A"))
    w, h = alpha.size
    data = alpha.tobytes()
    per_line = [data[y * w:(y + 1) * w].count(255) for y in range(h)]
    found = runs(per_line, GAP)
    heaviest = max((m for _, _, m in found), default=0)
    return [(top, end) for top, end, mass in found if mass >= heaviest * SPECK]


def frames_in(image: Image.Image, top: int, ground: int) -> list[tuple[int, int]]:
    """Frames of one row: (left, right) column runs, specks dropped."""
    band = solid(image.getchannel("A").crop((0, top, image.width, ground)))
    w, h = band.size
    data = band.tobytes()
    per_column = [sum(1 for y in range(h) if data[y * w + x]) for x in range(w)]
    found = runs(per_column, GAP)
    heaviest = max((m for _, _, m in found), default=0)
    return [(left, right) for left, right, mass in found if mass >= heaviest * SPECK]


def feet_x(sprite: Image.Image) -> float:
    """Centre of the opaque pixels in the sprite's lowest tenth (its bounding-box centre if none)."""
    box = solid(sprite.getchannel("A")).getbbox()
    if not box:
        return sprite.width / 2
    left, top, right, bottom = box
    floor = bottom - max(1, (bottom - top) // 10)
    alpha = solid(sprite.getchannel("A"))
    xs = [x for y in range(floor, bottom) for x in range(left, right) if alpha.getpixel((x, y))]
    return sum(xs) / len(xs) + 0.5 if xs else (left + right) / 2


def plan(board: dict) -> list[dict]:
    """The row layout from the config, validated: a list per row, or None for a skipped row."""
    atlas = board.get("atlas")
    if not atlas or not atlas.get("rows"):
        raise AtlasError(f"{board['id']}: no \"atlas\" with rows in the board config")
    if not atlas.get("height"):
        raise AtlasError(f"{board['id']}: atlas needs a game \"height\" in pixels")
    seen: set[str] = set()
    rows = []
    for row in atlas["rows"]:
        if row == "skip":
            rows.append(None)
            continue
        for anim in row:
            name, count = anim.get("anim"), anim.get("frames")
            if not name or not isinstance(count, int) or count < 1:
                raise AtlasError(f"{board['id']}: every animation needs a name and a frame count: {anim}")
            if name in seen:
                raise AtlasError(f"{board['id']}: animation {name!r} is listed twice")
            seen.add(name)
        rows.append(row)
    if not any(rows):
        raise AtlasError(f"{board['id']}: every row is skipped")
    return rows


def slice_board(board: dict, image: Image.Image) -> list[tuple[dict, list[tuple[Image.Image, int]]]]:
    """Cut the board into [(anim, [(sprite at 1x, pixels from its bottom up to the row's ground)])]."""
    rows = plan(board)
    found = bands(image)
    if len(found) != len(rows):
        raise AtlasError(f"{board['id']}: the board has {len(found)} rows of sprites, the config lists "
                         f"{len(rows)} (rows found at y = {[top for top, _ in found]})")
    out = []
    for number, (row, (top, ground)) in enumerate(zip(rows, found), 1):
        if row is None:
            continue
        columns = frames_in(image, top, ground)
        expected = sum(anim["frames"] for anim in row)
        if len(columns) != expected:
            names = " + ".join(f"{a['anim']} {a['frames']}" for a in row)
            raise AtlasError(f"{board['id']}: row {number} has {len(columns)} frames, the config expects "
                             f"{expected} ({names}); frames found at x = {[left for left, _ in columns]}")
        for anim in row:
            cut, columns = columns[:anim["frames"]], columns[anim["frames"]:]
            sprites = []
            for left, right in cut:
                cell = image.crop((left, top, right, ground))
                box = solid(cell.getchannel("A")).getbbox()
                sprites.append((cell.crop((0, box[1], cell.width, box[3])), ground - top - box[3]))
            out.append((anim, sprites))
    return out


def scale(sprite: Image.Image, factor: float) -> Image.Image:
    """Area-average with premultiplied alpha (no dark fringes), then hard alpha edges."""
    size = (max(1, round(sprite.width * factor)), max(1, round(sprite.height * factor)))
    small = sprite.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    small.putalpha(solid(small.getchannel("A")))
    return small


def export(board: dict, image: Image.Image) -> tuple[Image.Image, dict, dict]:
    """Return the atlas image, its Phaser JSON hash and the animation table."""
    anims = slice_board(board, image)
    factor = board["atlas"]["height"] / max(s.height + lift for s, lift in anims[0][1])
    placed = []  # (anim, [(sprite, lift, feet)]) at game scale
    for anim, sprites in anims:
        frames = []
        for sprite, lift in sprites:
            small = scale(sprite, factor)
            frames.append((small, round(lift * factor), feet_x(small)))
        placed.append((anim, frames))
    everything = [f for _, frames in placed for f in frames]
    half = max(max(feet, s.width - feet) for s, _, feet in everything)
    cell_w = 2 * math.ceil(half) + 2
    cell_h = max(s.height + lift for s, lift, _ in everything) + PAD_TOP
    columns = max(len(frames) for _, frames in placed)
    sheet = Image.new("RGBA", (columns * (cell_w + SPACING) - SPACING,
                               len(placed) * (cell_h + SPACING) - SPACING), (0, 0, 0, 0))
    hashed: dict = {}
    table: dict = {}
    for row, (anim, frames) in enumerate(placed):
        for n, (sprite, lift, feet) in enumerate(frames):
            x, y = n * (cell_w + SPACING), row * (cell_h + SPACING)
            sheet.alpha_composite(sprite, (x + round(cell_w / 2 - feet), y + cell_h - lift - sprite.height))
            hashed[f"{anim['anim']}-{n:02d}"] = {
                "frame": {"x": x, "y": y, "w": cell_w, "h": cell_h},
                "rotated": False, "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": cell_w, "h": cell_h},
                "sourceSize": {"w": cell_w, "h": cell_h},
                "pivot": {"x": 0.5, "y": 1},
            }
        table[anim["anim"]] = {"frames": len(frames), "fps": anim.get("fps", FPS), "loop": anim.get("loop", True)}
    atlas = {"frames": hashed, "meta": {
        "app": "scripts/export_atlas.py", "image": f"{board['id']}.png", "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height}, "scale": "1"}}
    return sheet, atlas, table


def preview(board_id: str, sheet: Image.Image, atlas: dict, table: dict, zoom: int = 3) -> None:
    """One looping GIF per animation on paper, nearest-upscaled, for the review page (not committed)."""
    PREVIEW.mkdir(parents=True, exist_ok=True)
    for name, anim in table.items():
        frames = []
        for n in range(anim["frames"]):
            r = atlas["frames"][f"{name}-{n:02d}"]["frame"]
            cell = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
            paper = Image.new("RGB", cell.size, PAPER)
            paper.paste(cell, mask=cell)
            frames.append(paper.resize((cell.width * zoom, cell.height * zoom), Image.Resampling.NEAREST))
        frames[0].save(PREVIEW / f"{board_id}--{name}.gif", save_all=True, append_images=frames[1:],
                       duration=round(1000 / anim["fps"]), loop=0 if anim["loop"] else 1, disposal=1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("ids", nargs="+", help="board ids from the config")
    parser.add_argument("--config", type=Path, default=CONFIG, help="board set (default: art/sprites/boards.json)")
    parser.add_argument("--out", type=Path, default=OUT, help="atlas folder (default: game/public/assets/sprites)")
    parser.add_argument("--preview", action="store_true", help="also write looping GIFs to tmp/atlas/")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    boards = {b["id"]: b for b in config["boards"]}
    try:
        for board_id in args.ids:
            if board_id not in boards:
                raise AtlasError(f"{board_id}: no such board in {args.config}")
            source = args.config.parent / "images" / f"{board_id}.png"
            if not source.exists():
                raise AtlasError(f"{board_id}: {source} does not exist; run make_boards.py crush first")
            sheet, atlas, table = export(boards[board_id], Image.open(source).convert("RGBA"))
            args.out.mkdir(parents=True, exist_ok=True)
            sheet.save(args.out / f"{board_id}.png", optimize=True)
            (args.out / f"{board_id}.json").write_text(json.dumps(atlas, indent=1) + "\n", encoding="utf-8")
            (args.out / f"{board_id}.anims.json").write_text(json.dumps(table, indent=1) + "\n", encoding="utf-8")
            if args.preview:
                preview(board_id, sheet, atlas, table)
            frame = next(iter(atlas["frames"].values()))["frame"]
            print(f"{board_id}: {len(atlas['frames'])} frames of {frame['w']}x{frame['h']} in "
                  f"{len(table)} animations -> {args.out / board_id}.png")
    except AtlasError as error:
        sys.exit(f"export_atlas: {error}")


if __name__ == "__main__":
    main()
