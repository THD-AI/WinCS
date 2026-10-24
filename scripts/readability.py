"""Readability contact sheet (#159): sprites at 1x on the stage they appear on, as the game shows them.

    python scripts/readability.py --out art/sprites/previews/prologue-readability.png [--atlas-dir tmp/atlas]
    python scripts/readability.py dexter:idle-00 fx-water:lily-bob-00@pond --out …
    python scripts/readability.py --all --out art/sprites/previews/readability-audit.png   # every clip of every atlas

Each spec is `atlas:frame`, optionally `@path` (default: stands on the stone path in front of the bench,
hg-0-0), `@pond` (floats on the pond surface, hg-4-0) or `@air` (in front of the trees, falling leaves).
The sheet shows the backgrounds at 1x (top) and the same at 3x (below), so a reviewer sees both what the
player sees and what the pixels are. For each sprite the report gives its size and its contrast: the
difference in mean luminance between its own pixels and the background right behind it, and its outline
contrast (the darkest sprite edge against the background). A sprite under 24 on both is flagged LOW –
it melts into the garden at game size and needs a darker outline or a lighter fill. After a gap, every LOW
sprite is drawn again with the game's actor rim (`rim`: its edge pixels lifted toward the warm rim light, as
pipeline.ts `addRim` does in the shader) and scored again, so the reviewer can compare the fix side by side. Each strip is cut to the sprites' width, and a
band that fills its strip wraps onto another. `@deck` and `@maze` stand on the rust maze (rc-0-0 and rc-1-0,
anomaly), composited from the stage's own layers behind the hero (z <= 5).
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
STAGES = ROOT / "game" / "public" / "assets" / "stages"
# Backgrounds cut from the approved chunks, and the ground line inside each cut, in the plate's own pixels
# (stage px = game px): the path in front of Dexter's bench is at y ≈ 437 in hg-0-0, the pond surface in
# hg-4-0 at y ≈ 560 (measured on the 2160x720 chunks).
BANDS = {
    "path": ("hg-0-0.png", (300, 300, 1380, 480), 137),
    "air": ("hg-0-0.png", (1000, 160, 2080, 340), 120),
    "pond": ("hg-4-0.png", (300, 500, 1380, 680), 70),
    # The rust maze: the first rover's deck (y 508) in rc-0-0 and the creek floor (y 569) in rc-1-0.
    "deck": (("rusty-creek", "rc-0-0", "anomaly"), (300, 330, 1380, 510), 178),
    "maze": (("rusty-creek", "rc-1-0", "anomaly"), (300, 390, 1380, 570), 179),
}
# --all: the band where each atlas appears (default: the maze deck).
HOME = {"dexter": "path", "dexter-acts": "path", "dexter-prologue": "path", "fx-ground": "path", "hero-move": "path",
        "hero-run": "path", "hero-air": "path", "fx-leaves": "air", "fx-water": "pond", "mensa-food": "path"}
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


def rim(piece: Image.Image, colour: tuple = RIM, strength: float = 0.45) -> Image.Image:
    """The game's actor rim (pipeline.ts `addRim`, ACTOR_RIM): every opaque pixel with a transparent 4-neighbour is
    mixed `strength` of the way to `colour` – a 1 px inner outline, the silhouette unchanged."""
    import numpy as np
    a = np.asarray(piece.convert("RGBA")).astype(float)
    solid = a[..., 3] > 127
    pad = np.pad(solid, 1)
    edge = solid & ~(pad[2:, 1:-1] & pad[:-2, 1:-1] & pad[1:-1, 2:] & pad[1:-1, :-2])
    a[edge, :3] += (np.array(colour[:3], float) - a[edge, :3]) * strength
    return Image.fromarray(a.round().astype("uint8"))


def plate(source) -> Image.Image:
    """A garden chunk image, or a creek chunk composited from its layers behind the hero, in z order."""
    if isinstance(source, str):
        return Image.open(GARDEN / source).convert("RGBA")
    region, chunk, state = source
    manifest = json.loads((STAGES / region / "stage.json").read_text(encoding="utf-8"))
    layers = next(c for c in manifest["chunks"] if c["id"] == chunk)["states"][state]["layers"]
    out = None
    for layer in sorted((l for l in layers if l["z"] <= 5), key=lambda l: l["z"]):
        image = Image.open(STAGES / region / layer["file"]).convert("RGBA")
        if out is None:
            out = image
        else:
            out.alpha_composite(image.resize(out.size))
    return out


def every_clip(folder: Path) -> list[str]:
    """One spec per clip of every exported atlas: its middle frame, on the band where the atlas appears."""
    specs = []
    for anims in sorted(folder.glob("*.anims.json")):
        atlas = anims.name[: -len(".anims.json")]
        for clip, meta in json.loads(anims.read_text(encoding="utf-8")).items():
            if isinstance(meta, dict) and meta.get("frames"):
                specs.append(f"{atlas}:{clip}-{meta['frames'] // 2:02d}@{HOME.get(atlas, 'deck')}")
    return specs


def strip(bg: Image.Image, band: str, ground: int, pieces: list, report: list[str]) -> Image.Image:
    """One background strip with its sprites standing on the ground line, the LOW ones again with a rim."""
    x, low = 12, []
    for name, piece in pieces:
        y = ground - piece.height
        behind = bg.crop((x, y, x + piece.width, y + piece.height))
        fill, edge = contrast(piece, behind)
        flag = "  LOW" if fill < LOW and edge < LOW else ""
        report.append(f"{name} @{band}: {piece.width}x{piece.height} px, fill {fill:.0f}, outline {edge:.0f}{flag}")
        if flag:
            lit = rim(piece)
            fill2, edge2 = contrast(lit, behind)
            report[-1] += f" -> with the rim: fill {fill2:.0f}, outline {edge2:.0f}" + ("" if fill2 >= LOW or edge2 >= LOW else "  STILL LOW")
            low.append(lit)
        bg.alpha_composite(piece, (x, y))
        x += piece.width + 10
    x += 30 if low else 0
    for piece in low:
        if x + piece.width > bg.width:
            break
        bg.alpha_composite(piece, (x, ground - piece.height))
        x += piece.width + 10
    return bg.crop((0, 0, min(bg.width, x + 2), bg.height))


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
        source, box, ground = BANDS[band]
        bg = plate(source).crop(box)
        # A band whose sprites don't fit one strip (with room left for the rimmed copies) wraps onto the next.
        while pieces:
            line, used = [], 12
            while pieces and (not line or used + pieces[0][1].width + 10 <= bg.width * 0.6):
                used += pieces[0][1].width + 10
                line.append(pieces.pop(0))
            strips.append(strip(bg.copy(), band, ground, line, report))
    if not strips:
        raise SystemExit("nothing to draw")
    width = max(s.width for s in strips)
    one = sum(s.height for s in strips) + 4 * (len(strips) - 1)
    if zoom == 1:  # 1x only: no close-up half
        out = Image.new("RGB", (width, one), (20, 20, 20))
        y = 0
        for s in strips:
            out.paste(s.convert("RGB"), (0, y))
            y += s.height + 4
        return out, report
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
    parser.add_argument("--all", action="store_true", help="every clip of every exported atlas (the #159 audit)")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--atlas-dir", type=Path, action="append", default=[],
                        help="extra atlas folders (review exports), searched after the game's")
    args = parser.parse_args()
    dirs = [SPRITES, *[(ROOT / d) if not d.is_absolute() else d for d in args.atlas_dir]]
    # The full audit is drawn at 1x only, so the sheet stays well under the repo's 6 MB file limit.
    out, report = sheet(every_clip(SPRITES) if args.all else args.specs or PROLOGUE, dirs, zoom=1 if args.all else 3)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out, optimize=True)
    print("\n".join(report))
    flagged = [line for line in report if "LOW" in line or "MISSING" in line]
    still = [line for line in flagged if "STILL LOW" in line or "MISSING" in line]
    print(f"{len(report) - len(flagged)} readable, {len(flagged)} low, {len(still)} still low with the rim")
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
