"""Check sizes and ratios against the references (AGENTS.md: reference fidelity).

    python scripts/compare.py images REF[@x,y,w,h] OURS[@x,y,w,h] --out art/<area>/previews/<name>-compare.png
        the reference above, ours below, both at the same width, one ruler grid over both

    python scripts/compare.py lineup hero-move:walk-00 hero-run:run-03 enemy-drone:hover-00 --out …
        frames from the game's atlases (game/public/assets/sprites) on one baseline, at game scale ×3,
        with a 1 ft ruler (13 px, docs/04) and the documented height of each thing marked;
        --atlas-dir tmp/atlas reads a review export instead of the game's atlases

Paths are relative to the repository. Images and crops are in their own pixels; `--width` sets the common width.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "game" / "public" / "assets" / "sprites"
FOOT = 13  # px per foot at stage scale (docs/04)
# Documented game heights in px (docs/04 scale table, docs/05): what each sprite should measure.
DOCUMENTED = {"hero": 76, "dexter": 20, "dexter-acts": 20, "enemy-rover": 25, "enemy-crab": 40, "enemy-drone": 45,
              "boss-jenny": 95, "boss-jenny-2": 95}
GRID = (255, 0, 255)


def load(ref: str) -> Image.Image:
    """An image path relative to the repo, optionally cropped: `path@x,y,w,h`."""
    path, _, box = ref.partition("@")
    image = Image.open(ROOT / path).convert("RGBA")
    if box:
        x, y, w, h = (int(v) for v in box.split(","))
        image = image.crop((x, y, x + w, y + h))
    return image


def grid(image: Image.Image, step: int) -> Image.Image:
    out = image.convert("RGB")
    draw = ImageDraw.Draw(out)
    for x in range(0, out.width, step):
        draw.line([(x, 0), (x, out.height)], fill=GRID, width=1)
    for y in range(0, out.height, step):
        draw.line([(0, y), (out.width, y)], fill=GRID, width=1)
    return out


def images(ref: str, ours: str, width: int, step: int) -> Image.Image:
    """Both images scaled to one width and stacked, the same grid over each so ratios read directly."""
    a, b = load(ref), load(ours)
    a = a.resize((width, round(a.height * width / a.width)), Image.Resampling.BOX)
    b = b.resize((width, round(b.height * width / b.width)), Image.Resampling.BOX)
    out = Image.new("RGB", (width, a.height + b.height + 8), (0, 0, 0))
    out.paste(grid(a, step), (0, 0))
    out.paste(grid(b, step), (0, a.height + 8))
    return out


def frame(atlas: str, name: str) -> Image.Image:
    """One frame from an exported atlas, trimmed to its pixels."""
    data = json.loads((SPRITES / f"{atlas}.json").read_text(encoding="utf-8"))
    frames = data["frames"] if isinstance(data["frames"], dict) else {f["filename"]: f for f in data["frames"]}
    if name not in frames:
        sys.exit(f"{atlas} has no frame {name}")
    r = frames[name]["frame"]
    piece = Image.open(SPRITES / f"{atlas}.png").convert("RGBA").crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
    return piece.crop(piece.getchannel("A").getbbox())


def documented(atlas: str) -> int | None:
    if atlas.startswith("hero"):
        return DOCUMENTED["hero"]
    return DOCUMENTED.get(atlas)


def lineup(specs: list[str], zoom: int = 3) -> tuple[Image.Image, list[str]]:
    """Frames on one baseline at game scale ×zoom, a foot ruler on the left, documented heights as ticks."""
    pieces = [(spec, frame(*spec.split(":", 1))) for spec in specs]
    gap = 24
    tallest = max(max(p.height for _, p in pieces), *(documented(s.split(":")[0]) or 0 for s, _ in pieces))
    width = 40 + sum(p.width + gap for _, p in pieces)
    out = Image.new("RGB", (width * zoom, (tallest + 20) * zoom), (232, 228, 220))
    draw = ImageDraw.Draw(out)
    base = (tallest + 10) * zoom
    for ft in range(0, tallest // FOOT + 2):  # the foot ruler
        y = base - ft * FOOT * zoom
        draw.line([(4 * zoom, y), (14 * zoom, y)], fill=(40, 40, 40), width=zoom)
    draw.line([(0, base), (out.width, base)], fill=(40, 40, 40), width=1)
    report, x = [], 40
    for spec, p in pieces:
        out.paste(p.resize((p.width * zoom, p.height * zoom), Image.Resampling.NEAREST), (x * zoom, base - p.height * zoom),
                  p.resize((p.width * zoom, p.height * zoom), Image.Resampling.NEAREST))
        want = documented(spec.split(":")[0])
        if want:
            y = base - want * zoom
            draw.line([(x * zoom, y), ((x + p.width) * zoom, y)], fill=GRID, width=zoom)
            off = round(100 * (max(p.width, p.height) if spec.startswith("enemy-drone") else p.height) / want - 100)
            report.append(f"{spec}: {p.width}x{p.height} px, documented {want} px ({off:+d} %)")
        else:
            report.append(f"{spec}: {p.width}x{p.height} px")
        x += p.width + gap
    return out, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    one = sub.add_parser("images", help="reference above, ours below")
    one.add_argument("ref")
    one.add_argument("ours")
    one.add_argument("--width", type=int, default=1280)
    one.add_argument("--grid", type=int, default=40)
    one.add_argument("--out", type=Path, required=True)
    two = sub.add_parser("lineup", help="atlas frames on one baseline with documented heights")
    two.add_argument("frames", nargs="+", help="atlas:frame, e.g. hero-move:walk-00")
    two.add_argument("--out", type=Path, required=True)
    two.add_argument("--atlas-dir", type=Path, help="read atlases from here (an export to tmp/ before approval)")
    args = parser.parse_args()
    if getattr(args, "atlas_dir", None):
        global SPRITES
        SPRITES = args.atlas_dir if args.atlas_dir.is_absolute() else ROOT / args.atlas_dir
    if args.mode == "images":
        out = images(args.ref, args.ours, args.width, args.grid)
    else:
        out, report = lineup(args.frames)
        print("\n".join(report))
    path = args.out if args.out.is_absolute() else ROOT / args.out
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)
    print(f"-> {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")


if __name__ == "__main__":
    main()
