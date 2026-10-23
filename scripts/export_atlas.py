"""Export an approved sprite board as a Phaser atlas for the game (docs/13 §5).

    art/sprites/images/<board>.png   crushed 1x board, transparent (make_boards.py crush)
      + "atlas" in art/sprites/boards.json: game height and the animations per row
      -> game/public/assets/sprites/<board>.png         frames packed one animation per row
      -> game/public/assets/sprites/<board>.json        Phaser JSON hash, frames <anim>-<nn>
      -> game/public/assets/sprites/<board>.anims.json  {"walk": {"frames": 8, "fps": 12, "loop": true}}

Slicing: the board's rows are bands of opaque pixels separated by empty lines; inside a row,
frames are column runs separated by empty columns. Specks below 2 % of a row's biggest frame are
dropped. When neighbours overlap (a foot under the next poncho), the row is cut along the cheapest
winding seams instead, one near each expected gap. Every row must hold exactly the frames its config
lists: a seam that would cut through a body, or a cell too light to be a figure, stops the export.

Scaling: one factor per board, so the tallest frame of the first animation becomes `height` game
pixels (hero: 76, in an 80 px frame), or the frame named by `ref` (e.g. "jump-08", standing) when the
first animation has no standing pose. Each frame keeps its height above the row's ground line, so
the feet of every frame land on the bottom row of its cell; an animation marked "float": true (a jump
the model drew in the air, while the game's physics already lifts the body) puts each frame's lowest
pixel on that row instead. The pivot is
(0.5, 1): on the baseline, centred under the torso.

Config, per board:
    "atlas": {"height": 76, "rows": [
        [{"anim": "idle", "frames": 6}],
        [{"anim": "walk", "frames": 8}, {"anim": "jump", "frames": 9, "loop": false, "fps": 10}],
        "skip",
        [{"anim": "death", "frames": 6}], [{"anim": "death", "frames": 6}]]}   # continues: death 12

Usage:
    python scripts/export_atlas.py hero-move [more ids] [--config …] [--out …] [--preview]
    python scripts/export_atlas.py hero-move --out tmp/atlas --preview   # review only: GIFs, no game files
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
PAPER = (232, 228, 220)
FPS = 12
GAP = 4         # empty lines that separate two rows or two frames on the 1x board
SPECK = 0.02    # runs lighter than this share of the row's heaviest frame are noise
PAD_TOP = 4     # head room above the tallest frame (hero: 76 + 4 = 80 px cell)
SPACING = 2     # transparent pixels between cells, so filtering never bleeds
CROSS = 0.25    # a seam may cut through at most this share of the row height (feet, hands)


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


def frames_in(image: Image.Image, top: int, ground: int, expected: int) -> tuple[list, str]:
    """Frames of one row as per-row (x0, x1) bounds, and why that failed ("" if it didn't).
    Column runs first; seams when there are fewer runs than expected frames."""
    band = solid(image.getchannel("A").crop((0, top, image.width, ground)))
    w, h = band.size
    data = band.tobytes()
    per_column = [sum(1 for y in range(h) if data[y * w + x]) for x in range(w)]
    found = runs(per_column, GAP)
    heaviest = max((m for _, _, m in found), default=0)
    kept = [(left, right) for left, right, mass in found if mass >= heaviest * SPECK]
    cells = [[(left, right)] * h for left, right in kept]
    if len(kept) == expected or not kept:
        return cells, ""
    found = f"{len(kept)} frames, the config expects {expected}"
    if len(kept) > expected:
        return cells, found
    split = seam_cells(data, w, h, kept[0][0], kept[-1][1], expected)
    return (split, "") if isinstance(split, list) else (cells, f"{found}: {split}")


def seam_cells(data: bytes, w: int, h: int, left: int, right: int, count: int) -> list[list[tuple[int, int]]] | str:
    """Split columns left..right into `count` cells along cheap winding seams; per-row (x0, x1) bounds,
    or the reason it can't be done."""
    pitch = (right - left) / count
    cuts = []
    for k in range(1, count):
        centre = left + k * pitch
        lo, hi = max(left + 1, int(centre - pitch / 2)), min(right - 1, int(centre + pitch / 2))
        xs = range(lo, hi + 1)

        def cost(y, x):
            return (1 if data[y * w + x] else 0) + 0.001 * abs(x - centre)

        total = [cost(0, x) for x in xs]
        back = []
        for y in range(1, h):
            step, came = [], []
            for i, x in enumerate(xs):
                j = min((j for j in (i - 1, i, i + 1) if 0 <= j < len(total)), key=total.__getitem__)
                step.append(total[j] + cost(y, x))
                came.append(j)
            total = step
            back.append(came)
        i = min(range(len(total)), key=total.__getitem__)
        path = [i]
        for came in reversed(back):
            i = came[i]
            path.append(i)
        seam = [lo + i for i in reversed(path)]
        crossed = sum(1 for y, x in enumerate(seam) if data[y * w + x])
        if crossed > CROSS * h:
            return f"no clean cut near x = {round(centre)} (it would cross {crossed} px of sprite)"
        cuts.append(seam)
    edges = [[left - 1] * h, *cuts, [right] * h]
    cells = [[(a[y] + 1, b[y] + 1) for y in range(h)] for a, b in zip(edges, edges[1:])]
    masses = [sum(1 for y, (x0, x1) in enumerate(c) for x in range(x0, x1) if data[y * w + x]) for c in cells]
    middle = sorted(masses)[len(masses) // 2]
    if min(masses) < middle / 2:
        return f"the cell at x = {cells[masses.index(min(masses))][0][0]} is too light to be a figure"
    return cells


def body_x(sprite: Image.Image) -> float:
    """Centre of the torso: the opaque pixels between 35 % and 65 % of the sprite's height. Walk and run
    cycles keep the body still in the cell (the physics moves it), whichever foot is down."""
    alpha = solid(sprite.getchannel("A"))
    box = alpha.getbbox()
    if not box:
        return sprite.width / 2
    left, top, right, bottom = box
    rows = range(top + (bottom - top) * 35 // 100, top + (bottom - top) * 65 // 100 + 1)
    xs = [x for y in rows for x in range(left, right) if alpha.getpixel((x, y))]
    return sum(xs) / len(xs) + 0.5 if xs else (left + right) / 2


def plan(board: dict) -> list[dict]:
    """The row layout from the config, validated: a list per row, or None for a skipped row."""
    atlas = board.get("atlas")
    if not atlas or not atlas.get("rows"):
        raise AtlasError(f"{board['id']}: no \"atlas\" with rows in the board config")
    if not atlas.get("height"):
        raise AtlasError(f"{board['id']}: atlas needs a game \"height\" in pixels")
    seen: set[str] = set()
    last = None  # an animation may continue at the start of the next row (death 6 + 6)
    rows = []
    for row in atlas["rows"]:
        if row == "skip":
            rows.append(None)
            continue
        for place, anim in enumerate(row):
            name, count = anim.get("anim"), anim.get("frames")
            if not name or not isinstance(count, int) or count < 1:
                raise AtlasError(f"{board['id']}: every animation needs a name and a frame count: {anim}")
            if name in seen and not (place == 0 and name == last):
                raise AtlasError(f"{board['id']}: animation {name!r} is listed twice")
            seen.add(name)
            last = name
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
        expected = sum(anim["frames"] for anim in row)
        columns, problem = frames_in(image, top, ground, expected)
        if problem:
            names = " + ".join(f"{a['anim']} {a['frames']}" for a in row)
            counts, _, reason = problem.partition(": ")
            raise AtlasError(f"{board['id']}: row {number} has {counts} ({names}); frames found at "
                             f"x = {[bounds[0][0] for bounds in columns]}" + (f"; {reason}" if reason else ""))
        for anim in row:
            cut, columns = columns[:anim["frames"]], columns[anim["frames"]:]
            sprites = []
            for bounds in cut:
                left, right = min(b[0] for b in bounds), max(b[1] for b in bounds)
                cell = image.crop((left, top, right, ground))
                keep = Image.new("L", cell.size, 0)
                for y, (x0, x1) in enumerate(bounds):
                    keep.paste(255, (x0 - left, y, x1 - left, y + 1))
                cell.putalpha(Image.composite(cell.getchannel("A"), keep, keep))
                box = solid(cell.getchannel("A")).getbbox()
                lift = 0 if anim.get("float") else ground - top - box[3]
                sprites.append((cell.crop((0, box[1], cell.width, box[3])), lift))
            if out and out[-1][0]["anim"] == anim["anim"]:
                out[-1][1].extend(sprites)
            else:
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
    ref = board["atlas"].get("ref")
    if ref:
        frames = {f"{anim['anim']}-{n:02d}": s for anim, sprites in anims for n, s in enumerate(sprites)}
        if ref not in frames:
            raise AtlasError(f"{board['id']}: ref frame {ref!r} does not exist")
        reference = [frames[ref]]
    else:
        reference = anims[0][1]
    factor = board["atlas"]["height"] / max(s.height + lift for s, lift in reference)
    placed = []  # (anim, [(sprite, lift, feet)]) at game scale
    for anim, sprites in anims:
        frames = []
        for sprite, lift in sprites:
            small = scale(sprite, factor)
            frames.append((small, round(lift * factor), body_x(small)))
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


def preview(folder: Path, board_id: str, sheet: Image.Image, atlas: dict, table: dict, zoom: int = 2) -> None:
    """One looping GIF per animation on paper at twice game size, for the board's review page."""
    folder.mkdir(parents=True, exist_ok=True)
    for name, anim in table.items():
        frames = []
        for n in range(anim["frames"]):
            r = atlas["frames"][f"{name}-{n:02d}"]["frame"]
            cell = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
            paper = Image.new("RGB", cell.size, PAPER)
            paper.paste(cell, mask=cell)
            frames.append(paper.resize((cell.width * zoom, cell.height * zoom), Image.Resampling.NEAREST))
        frames[0].save(folder / f"{board_id}--{name}.gif", save_all=True, append_images=frames[1:],
                       duration=round(1000 / anim["fps"]), loop=0 if anim["loop"] else 1, disposal=1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("ids", nargs="+", help="board ids from the config")
    parser.add_argument("--config", type=Path, default=CONFIG, help="board set (default: art/sprites/boards.json)")
    parser.add_argument("--out", type=Path, default=OUT, help="atlas folder (default: game/public/assets/sprites)")
    parser.add_argument("--preview", action="store_true", help="also write looping GIFs to <config folder>/previews/")
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
                preview(args.config.parent / "previews", board_id, sheet, atlas, table)
            frame = next(iter(atlas["frames"].values()))["frame"]
            print(f"{board_id}: {len(atlas['frames'])} frames of {frame['w']}x{frame['h']} in "
                  f"{len(table)} animations -> {args.out / board_id}.png")
    except AtlasError as error:
        sys.exit(f"export_atlas: {error}")


if __name__ == "__main__":
    main()
