"""Cut the approved UI boards into named pieces and pack them into one Phaser atlas.

    art/ui/images/<board>.png (crushed, transparent)  + "ui" rows in art/ui/ui.json
      -> rows (empty horizontal bands) -> pieces (empty column gaps) -> count check against the names
      -> one shared cell per animation row, scaled to the row's game height
      -> game/public/assets/ui/ui.png + ui.json (Phaser atlas) + ui-layout.json (screen hole in the case)

Usage:
    python scripts/export_ui.py --out tmp/ui --preview   # before approval: contact sheet only
    python scripts/export_ui.py                          # after approval: into the game

A board's "ui" entry lists its rows top to bottom:
    {"names": ["cell-full", "cell-cracked", "cell-empty"], "height": 36}
    {"names": ["crack-0", ...], "height": 36, "cell": true}   # frames share one cell, bottom-centred
    {"names": ["pocket-frame"], "width": 800}                  # scale by width instead
    {"names": ["icon-leaf", ...], "factor_of": "room-visited"} # same scale as an earlier piece
"crt-screen" uses "like": "pocket-frame": the same crop and scale, so it lies exactly under the case.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "art" / "ui" / "ui.json"
IMAGES = ROOT / "art" / "ui" / "images"
OUT = ROOT / "game" / "public" / "assets" / "ui"
PREVIEWS = ROOT / "art" / "ui" / "previews"
GAP = 10       # px of empty columns (crushed size) that separate two pieces in a row
ATLAS_W = 2048
PAD = 2


def bands(mask: list[bool], gap: int = 1) -> list[tuple[int, int]]:
    """Runs of True in `mask`, merging runs separated by fewer than `gap` False entries."""
    runs: list[list[int]] = []
    for i, on in enumerate(mask):
        if not on:
            continue
        if runs and i - runs[-1][1] <= gap:
            runs[-1][1] = i + 1
        else:
            runs.append([i, i + 1])
    return [(a, b) for a, b in runs]


def rows_of(image: Image.Image) -> list[tuple[int, int]]:
    alpha = image.getchannel("A")
    w, h = alpha.size
    px = alpha.load()
    filled = [any(px[x, y] for x in range(w)) for y in range(h)]
    return bands(filled, GAP)


def pieces_of(image: Image.Image, top: int, bottom: int) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of the pieces in one row band, left to right."""
    band = image.crop((0, top, image.width, bottom))
    alpha = band.getchannel("A")
    px = alpha.load()
    cols = [any(px[x, y] for y in range(band.height)) for x in range(band.width)]
    boxes = []
    for a, b in bands(cols, GAP):
        box = alpha.crop((a, 0, b, band.height)).getbbox()
        if box:
            boxes.append((a + box[0], top + box[1], a + box[2], top + box[3]))
    return boxes


def scale_to(piece: Image.Image, factor: float) -> Image.Image:
    size = (max(1, round(piece.width * factor)), max(1, round(piece.height * factor)))
    method = Image.Resampling.BOX if factor < 1 else Image.Resampling.NEAREST
    out = piece.convert("RGBa").resize(size, method).convert("RGBA")
    out.putalpha(out.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    return out


def cut(board: dict, image: Image.Image, crops: dict) -> dict[str, Image.Image]:
    """Named pieces of one board at game size; stops when the drawing doesn't match its names."""
    spec = board["ui"]
    if "like" in spec:
        box, factor = crops[spec["like"]]
        return {spec["name"]: scale_to(image.crop(box), factor)}
    found = rows_of(image)
    if len(found) != len(spec["rows"]):
        sys.exit(f"{board['id']}: {len(found)} rows drawn, config lists {len(spec['rows'])}")
    out = {}
    for (top, bottom), row in zip(found, spec["rows"]):
        boxes = pieces_of(image, top, bottom)
        names = row["names"]
        if len(boxes) != len(names):
            sys.exit(f"{board['id']}: row {names[0]}… has {len(boxes)} pieces, config lists {len(names)}")
        if row.get("cell"):
            # Animation frames: one cell for all, bottom-centred, so the frames don't jitter.
            w = max(b[2] - b[0] for b in boxes)
            h = max(b[3] - b[1] for b in boxes)
            boxes = [((b[0] + b[2] - w) // 2, b[3] - h, (b[0] + b[2] + w) // 2, b[3]) for b in boxes]
        tallest = max(b[3] - b[1] for b in boxes)
        widest = max(b[2] - b[0] for b in boxes)
        if "factor_of" in row:  # same scale as another piece, so line widths and glow match
            factor = crops[row["factor_of"]][1]
        else:
            factor = row["height"] / tallest if "height" in row else row["width"] / widest
        for name, box in zip(names, boxes):
            out[name] = scale_to(image.crop(box), factor)
            crops[name] = (box, factor)
    return out


def pack(pieces: dict[str, Image.Image]) -> tuple[Image.Image, dict]:
    """Shelf packing, tallest first; returns the atlas and its Phaser JSON (hash format)."""
    order = sorted(pieces, key=lambda n: (-pieces[n].height, n))
    x = y = shelf = 0
    places = {}
    for name in order:
        p = pieces[name]
        if x + p.width + PAD > ATLAS_W:
            x, y, shelf = 0, y + shelf + PAD, 0
        places[name] = (x, y)
        x += p.width + PAD
        shelf = max(shelf, p.height)
    atlas = Image.new("RGBA", (ATLAS_W, y + shelf))
    frames = {}
    for name, (px, py) in places.items():
        p = pieces[name]
        atlas.paste(p, (px, py))
        frames[name] = {"frame": {"x": px, "y": py, "w": p.width, "h": p.height}, "rotated": False,
                        "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": p.width, "h": p.height},
                        "sourceSize": {"w": p.width, "h": p.height}}
    meta = {"image": "ui.png", "format": "RGBA8888", "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"}
    return atlas, {"frames": frames, "meta": meta}


def layout(pieces: dict[str, Image.Image]) -> dict:
    """Where the map goes: the screen's opaque box inside the case (both share one size and origin)."""
    out = {}
    if "crt-screen" in pieces and "pocket-frame" in pieces:
        box = pieces["crt-screen"].getchannel("A").getbbox()
        if box:
            out["pocket-frame"] = {"size": list(pieces["pocket-frame"].size),
                                   "screen": [box[0], box[1], box[2] - box[0], box[3] - box[1]]}
    return out


def contact(pieces: dict[str, Image.Image], lay: dict) -> Image.Image:
    """The HUD and the open map over a Rusty Creek frame, at game size, for the review page."""
    plate = ROOT / "art" / "stages" / "rusty-creek" / "images" / "after-center.png"
    frame = Image.open(plate).convert("RGBA").crop((0, 0, 1280, 720)) if plate.exists() \
        else Image.new("RGBA", (1280, 720), (23, 36, 45, 255))
    put = lambda name, xy: name in pieces and frame.alpha_composite(pieces[name], xy)
    for i, name in enumerate(["cell-full"] * 3 + ["cell-cracked", "cell-empty"]):
        put(name, (28 + i * ((pieces.get(name).width if name in pieces else 18) + 8), 28))
    for i, name in enumerate(["glitch-charged-0", "glitch-charged-1", "glitch-empty"]):
        if name in pieces:
            put(name, (28 + i * (pieces[name].width + 6), 80))
    bar = pieces.get("boss-bar-frame")
    if bar:
        bx, by = (1280 - bar.width) // 2, 720 - 44 - bar.height
        fill = pieces["boss-bar-fill"]
        fill = fill.crop((fill.width // 5, 0, fill.width - fill.width // 5, fill.height))  # tile the middle, not the caps
        inner = round(bar.width * 0.9)
        for x in range(0, round(inner * 0.7), fill.width):  # Jenny at 70 %
            frame.alpha_composite(fill.crop((0, 0, min(fill.width, round(inner * 0.7) - x), fill.height)),
                                  (bx + (bar.width - inner) // 2 + x, by + (bar.height - fill.height) // 2))
        put("boss-bar-frame", (bx, by))
        put("boss-icon", (bx - pieces["boss-icon"].width - 10, by + (bar.height - pieces["boss-icon"].height) // 2))
    if "pocket-frame" in lay:
        w, h = lay["pocket-frame"]["size"]
        ox, oy = (1280 - w) // 2, (720 - h) // 2
        put("crt-screen", (ox, oy))
        sx, sy, sw, sh = lay["pocket-frame"]["screen"]
        room = pieces.get("room-visited")
        if room:
            # The slice's map as the game draws it: the garden above, the creek's three rooms below.
            gap = 36
            left = ox + sx + (sw - 3 * room.width - 2 * gap) // 2
            top = oy + sy + (sh - 2 * room.height - gap) // 2
            cell = lambda gx, gy: (left + gx * (room.width + gap), top + gy * (room.height + gap))
            corridor_v, corridor_h = pieces.get("corridor-v"), pieces.get("corridor-h")
            if corridor_v:
                x, y = cell(0, 0)
                frame.alpha_composite(corridor_v.resize((corridor_v.width, gap + 8)),
                                      (x + room.width // 2 - corridor_v.width // 2, y + room.height - 4))
            if corridor_h:
                for gx in (0, 1):
                    x, y = cell(gx, 1)
                    frame.alpha_composite(corridor_h.resize((gap + 8, corridor_h.height)),
                                          (x + room.width - 4, y + room.height // 2 - corridor_h.height // 2))
            rooms = [((0, 0), "room-visited", "icon-leaf"), ((0, 1), "room-visited", "icon-mountains"),
                     ((1, 1), "room-current", None), ((2, 1), "room-unexplored", None)]
            for (gx, gy), name, icon in rooms:
                x, y = cell(gx, gy)
                put(name, (x, y))
                mark = icon or ("player-dot-0" if name == "room-current" else None)
                if mark and mark in pieces:
                    m = pieces[mark]
                    put(mark, (x + (room.width - m.width) // 2, y + (room.height - m.height) // 2))
        put("pocket-frame", (ox, oy))
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=OUT, help="where the atlas goes (tmp/ui before approval)")
    parser.add_argument("--preview", action="store_true", help="also write art/ui/previews/contact.png")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    pieces: dict[str, Image.Image] = {}
    crops: dict = {}
    for board in config["boards"]:
        path = IMAGES / f"{board['id']}.png"
        if "ui" not in board or not path.exists():
            print(f"{board['id']}: skipped (no ui rows or no crushed image)")
            continue
        found = cut(board, Image.open(path).convert("RGBA"), crops)
        pieces.update(found)
        print(f"{board['id']}: {len(found)} pieces")
    if not pieces:
        sys.exit("nothing to export")
    atlas, data = pack(pieces)
    args.out.mkdir(parents=True, exist_ok=True)
    atlas.save(args.out / "ui.png", optimize=True)
    (args.out / "ui.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    lay = layout(pieces)
    (args.out / "ui-layout.json").write_text(json.dumps(lay, indent=1), encoding="utf-8")
    print(f"{len(pieces)} pieces -> {args.out / 'ui.png'} {atlas.width}x{atlas.height}")
    if args.preview:
        PREVIEWS.mkdir(parents=True, exist_ok=True)
        contact(pieces, lay).convert("RGB").save(PREVIEWS / "contact.png", optimize=True)
        print(f"contact sheet -> {(PREVIEWS / 'contact.png').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
