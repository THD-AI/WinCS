"""Readability contact sheet (#159): every prologue sprite at 1x on the Hidden Garden, as the game shows it.

    python scripts/readability.py --out art/sprites/previews/prologue-readability.png [--atlas-dir tmp/atlas]
    python scripts/readability.py dexter:idle-00 fx-water:lily-bob-00@pond --out …

Each spec is `atlas:frame`, optionally `@path` (default: stands on the stone path in front of the bench,
hg-0-0), `@pond` (floats on the pond surface, hg-4-0) or `@air` (in front of the trees, falling leaves).
The sheet shows the backgrounds at 1x (top) and the same at 3x (below), so a reviewer sees both what the
player sees and what the pixels are. For each sprite the report gives its size and its contrast: the
difference in mean luminance between its own pixels and the background right behind it, and its outline
contrast (the darkest sprite edge against the background). A sprite under 24 on both is flagged LOW –
it melts into the garden at game size and needs a darker outline or a lighter fill. After a gap, every LOW
sprite is drawn again with a 1 px warm rim light around it (`rim`, what the game can add in code with an
outline shader), so the reviewer can compare the fix side by side. Each strip is cut to the sprites' width.
Atlases are read from the game's folder first, then from --atlas-dir (a review export).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "game" / "public" / "assets" / "sprites"
GARDEN = ROOT / "art" / "stages" / "hidden-garden" / "images"
# Backgrounds cut from the approved chunks, and the ground line inside each cut, in the plate's own pixels
# (stage px = game px): the path in front of Dexter's bench is at y ≈ 437 in hg-0-0, the pond surface in
# hg-4-0 at y ≈ 560 (measured on the 2160x720 chunks).
BANDS = {
    "path": ("hg-0-0.png", (300, 300, 1380, 480), 137),
    "air": ("hg-0-0.png", (1000, 160, 2080, 340), 120),
    "pond": ("hg-4-0.png", (300, 500, 1380, 680), 70),
}
LOW = 24
RIM = (255, 222, 160, 255)  # the style master's warm rim light
PROLOGUE = [
    "hero-move:idle-00", "hero-move:walk-03", "hero-run:run-03", "hero-air:jump-04", "hero-hurt:knockback-01",
    "dexter:idle-00", "dexter:hop-02", "dexter:walk-02", "dexter:point-02", "dexter:shove-02",
    "dexter-acts:beckon-01", "dexter-acts:creepy-00", "dexter-prologue:sit-00", "dexter-prologue:look-back-02",
    "dexter-prologue:wait-01", "mensa-food:muffin-00", "pocket-computer:bob-00",
    "fx-ground:dust-01", "fx-ground:grass-01", "fx-ground:leaf-kick-01",
    "fx-leaves:birch-00@air", "fx-leaves:maple-00@air", "fx-leaves:oak-00@air", "fx-leaves:maple-02@air",
    "fx-water:lily-bob-00@pond", "fx-water:ripple-01@pond", "fx-water:sparkle-02@pond", "fx-ground:splash-01@pond",
]


def frame(atlas: str, name: str, dirs: list[Path]) -> Image.Image:
    """One atlas frame trimmed to its pixels, from the first folder that has the atlas."""
    for folder in dirs:
        if (folder / f"{atlas}.json").exists():
            data = json.loads((folder / f"{atlas}.json").read_text(encoding="utf-8"))
            frames = data["frames"] if isinstance(data["frames"], dict) else {f["filename"]: f for f in data["frames"]}
            if name not in frames:
                raise KeyError(f"{atlas} has no frame {name}")
            r = frames[name]["frame"]
            piece = Image.open(folder / f"{atlas}.png").convert("RGBA").crop(
                (r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
            return piece.crop(piece.getchannel("A").getbbox())
    raise FileNotFoundError(f"no atlas {atlas} in " + ", ".join(str(d) for d in dirs))


def luma(p: tuple) -> float:
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def contrast(sprite: Image.Image, behind: Image.Image) -> tuple[float, float]:
    """(fill, edge): |mean luma of the sprite - mean luma behind it|, and the same for its outline pixels only."""
    alpha = sprite.getchannel("A")
    s, b = sprite.convert("RGB"), behind.convert("RGB")
    w, h = sprite.size
    inside, edge, back = [], [], []
    for y in range(h):
        for x in range(w):
            if alpha.getpixel((x, y)) < 128:
                back.append(luma(b.getpixel((x, y))))
                continue
            v = luma(s.getpixel((x, y)))
            inside.append(v)
            if any(not (0 <= x + dx < w and 0 <= y + dy < h) or alpha.getpixel((x + dx, y + dy)) < 128
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge.append(v)
    if not back:  # a sprite that fills its box: compare against the box's own background
        back = [luma(p) for p in b.getdata()]
    bg = sum(back) / len(back)
    fill = abs(sum(inside) / len(inside) - bg) if inside else 0.0
    rim = abs(sum(edge) / len(edge) - bg) if edge else 0.0
    return fill, rim


def rim(piece: Image.Image, colour: tuple = RIM) -> Image.Image:
    """The sprite padded by 1 px with a 1 px outline of `colour` around its opaque pixels."""
    alpha = piece.getchannel("A")
    out = Image.new("RGBA", (piece.width + 2, piece.height + 2))
    for y in range(out.height):
        for x in range(out.width):
            inside = 0 < x <= piece.width and 0 < y <= piece.height and alpha.getpixel((x - 1, y - 1)) >= 128
            if not inside and any(0 < x + dx <= piece.width and 0 < y + dy <= piece.height
                                  and alpha.getpixel((x + dx - 1, y + dy - 1)) >= 128
                                  for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out.putpixel((x, y), colour)
    out.alpha_composite(piece, (1, 1))
    return out


def sheet(specs: list[str], dirs: list[Path], zoom: int = 3) -> tuple[Image.Image, list[str]]:
    rows: dict[str, list[tuple[str, Image.Image]]] = {}
    report = []
    for spec in specs:
        name, _, band = spec.partition("@")
        band = band or "path"
        try:
            piece = frame(*name.split(":", 1), dirs=dirs)
        except (FileNotFoundError, KeyError) as error:
            report.append(f"{spec}: MISSING ({error})")
            continue
        rows.setdefault(band, []).append((name, piece))
    strips = []
    for band, pieces in rows.items():
        file, box, ground = BANDS[band]
        bg = Image.open(GARDEN / file).convert("RGBA").crop(box)
        x, low = 12, []
        for name, piece in pieces:
            if x + piece.width > bg.width:
                break
            y = ground - piece.height
            behind = bg.crop((x, y, x + piece.width, y + piece.height))
            fill, edge = contrast(piece, behind)
            flag = "  LOW" if fill < LOW and edge < LOW else ""
            report.append(f"{name} @{band}: {piece.width}x{piece.height} px, fill {fill:.0f}, outline {edge:.0f}{flag}")
            if flag:
                low.append(rim(piece))
            bg.alpha_composite(piece, (x, y))
            x += piece.width + 10
        x += 30 if low else 0
        for piece in low:
            if x + piece.width > bg.width:
                break
            bg.alpha_composite(piece, (x, ground + 1 - piece.height))
            x += piece.width + 10
        bg = bg.crop((0, 0, min(bg.width, x + 2), bg.height))
        strips.append(bg)
    if not strips:
        raise SystemExit("nothing to draw")
    width = max(s.width for s in strips)
    one = sum(s.height for s in strips) + 4 * (len(strips) - 1)
    out = Image.new("RGB", (width * zoom, one + 8 + one * zoom), (20, 20, 20))
    y = 0
    for s in strips:  # 1x on top
        out.paste(s.convert("RGB"), (0, y))
        y += s.height + 4
    y += 4
    for s in strips:  # the same, 3x
        big = s.resize((s.width * zoom, s.height * zoom), Image.Resampling.NEAREST).convert("RGB")
        out.paste(big, (0, y))
        y += big.height + 4 * zoom
    ImageDraw.Draw(out).line([(0, one + 3), (width - 1, one + 3)], fill=(255, 0, 255))
    return out, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("specs", nargs="*", help="atlas:frame[@path|air|pond]; default: the prologue set")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--atlas-dir", type=Path, action="append", default=[],
                        help="extra atlas folders (review exports), searched after the game's")
    args = parser.parse_args()
    dirs = [SPRITES, *[(ROOT / d) if not d.is_absolute() else d for d in args.atlas_dir]]
    out, report = sheet(args.specs or PROLOGUE, dirs)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out, optimize=True)
    print("\n".join(report))
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
