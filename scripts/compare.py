"""Check sizes and ratios against the references (AGENTS.md: reference fidelity).

    python scripts/compare.py images REF[@x,y,w,h] OURS[@x,y,w,h] --out art/<area>/previews/<name>-compare.png
        the reference above, ours below, both at the same width, one ruler grid over both

    python scripts/compare.py lineup hero-move:walk-00 hero-run:run-03 enemy-drone:hover-00 --out …
        frames from the game's atlases (game/public/assets/sprites) on one baseline, at game scale ×3,
        with a 1 ft ruler (13 px, docs/04) and the documented height of each thing marked;
        --atlas-dir tmp/atlas reads a review export instead of the game's atlases;
        atlas:frame*2.15 draws a frame the game scales in code (and scales its documented height too)

    python scripts/compare.py parallax art/stages/hidden-garden --state clean --at 0 440 880 --out …
        the region's layers from export.json, drawn as the game draws them at each camera x (a layer sits
        at its chunk's origin and moves s px per camera px; a region plate's tile j rides on chunk j),
        one 1280x720 view per row

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
DOCUMENTED = {"hero": 114, "dexter": 40, "dexter-acts": 40, "dexter-prologue": 40, "enemy-rover": 25, "enemy-crab": 40, "enemy-drone": 45,
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


def feet(piece: Image.Image, band: int = 3) -> list[tuple[int, int]]:
    """Runs of opaque pixels in the bottom `band` rows of a frame: the feet on the ground, left to right."""
    alpha = piece.getchannel("A")
    w, h = piece.size
    rows = [y for y in range(h) if any(alpha.getpixel((x, y)) > 128 for x in range(w))]
    if not rows:
        return []
    xs = sorted({x for y in range(max(rows) - band + 1, max(rows) + 1) for x in range(w) if alpha.getpixel((x, y)) > 128})
    runs: list[list[int]] = []
    for x in xs:
        if runs and x - runs[-1][1] <= 2:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    return [(a, b) for a, b in runs]


def stride(atlas: str, anim: str) -> tuple[float, float, list[str]]:
    """The step length of a locomotion cycle: the widest spread between two planted feet (double support), and
    the stride – two steps – that the body must travel per cycle for the feet not to slide."""
    clips = json.loads((SPRITES / f"{atlas}.anims.json").read_text(encoding="utf-8"))
    report, step = [], 0.0
    for i in range(clips[anim]["frames"]):
        runs = feet(frame(atlas, f"{anim}-{i:02d}"))
        spread = (runs[-1][0] + runs[-1][1]) / 2 - (runs[0][0] + runs[0][1]) / 2 if len(runs) >= 2 else 0.0
        step = max(step, spread)
        report.append(f"{anim}-{i:02d}: feet {runs} spread {spread:.1f}")
    fps = clips[anim]["fps"]
    speed = 2 * step * fps / clips[anim]["frames"]
    report.append(f"{atlas}:{anim}: step {step:.1f} px, stride {2 * step:.1f} px per {clips[anim]['frames']}-frame cycle"
                  f" -> {speed:.0f} px/s at {fps} fps without sliding")
    return step, 2 * step, report


def documented(atlas: str) -> int | None:
    if atlas.startswith("hero"):
        return DOCUMENTED["hero"]
    return DOCUMENTED.get(atlas)


def wanted(spec: str) -> int | None:
    """The documented height for a lineup spec, times its `*scale` if it has one."""
    name, _, scale = spec.partition("*")
    want = documented(name.split(":")[0])
    return round(want * float(scale)) if want and scale else want


def lineup(specs: list[str], zoom: int = 3) -> tuple[Image.Image, list[str]]:
    """Frames on one baseline at game scale ×zoom, a foot ruler on the left, documented heights as ticks."""
    pieces = []
    for spec in specs:
        name, _, scale = spec.partition("*")
        p = frame(*name.split(":", 1))
        if scale:
            p = p.resize((round(p.width * float(scale)), round(p.height * float(scale))), Image.Resampling.NEAREST)
        pieces.append((spec, p))
    gap = 24
    tallest = max(max(p.height for _, p in pieces), *(wanted(s) or 0 for s, _ in pieces))
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
        want = wanted(spec)
        if want:
            y = base - want * zoom
            draw.line([(x * zoom, y), ((x + p.width) * zoom, y)], fill=GRID, width=zoom)
            off = round(100 * (max(p.width, p.height) if spec.startswith("enemy-drone") else p.height) / want - 100)
            report.append(f"{spec}: {p.width}x{p.height} px, documented {want} px ({off:+d} %)")
        else:
            report.append(f"{spec}: {p.width}x{p.height} px")
        x += p.width + gap
    return out, report


VIEW = (1280, 720)


def parallax(region: Path, state: str, cameras: list[int]) -> Image.Image:
    """The stage at each camera x, every layer offset by its scroll factor; one view per row."""
    config = json.loads((region / "export.json").read_text(encoding="utf-8"))
    w, h = 2160, 720
    rows = []
    for cam in cameras:
        view = Image.new("RGBA", VIEW, (0, 0, 0, 255))
        for layer_id in config["states"][state]:
            layer = config["layers"][layer_id]
            for name, chunk in config["chunks"].items():
                path = region / (layer["file"].format(tile=chunk["x"]) if layer.get("region")
                                 else layer["file"].format(name=chunk.get("name", name)))
                if not path.exists():
                    continue
                s = layer["scroll"]
                x = round(chunk["x"] * w - cam * s)  # the game: a layer at its chunk's origin, moving at its scroll
                if x <= -w or x >= VIEW[0]:  # wholly off the view
                    continue
                plate = Image.open(path).convert("RGBA")
                if x < 0:  # alpha_composite needs a non-negative destination: crop the plate instead
                    plate, x = plate.crop((-x, 0, plate.width, plate.height)), 0
                if x < VIEW[0] and plate.width:
                    view.alpha_composite(plate, (x, chunk["y"] * h))
        rows.append(view)
    out = Image.new("RGB", (VIEW[0], (VIEW[1] + 8) * len(rows) - 8), GRID)
    for i, view in enumerate(rows):
        out.paste(view.convert("RGB"), (0, i * (VIEW[1] + 8)))
    return out


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
    four = sub.add_parser("stride", help="the stride of a walk or run cycle, measured from its planted feet")
    four.add_argument("clips", nargs="+", help="atlas:anim, e.g. hero-move:walk")
    three = sub.add_parser("parallax", help="a stage region at several camera positions")
    three.add_argument("region", type=Path)
    three.add_argument("--state", default="clean")
    three.add_argument("--at", type=int, nargs="+", default=[0, 440, 880], help="camera x positions")
    three.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if getattr(args, "atlas_dir", None):
        global SPRITES
        SPRITES = args.atlas_dir if args.atlas_dir.is_absolute() else ROOT / args.atlas_dir
    if args.mode == "stride":
        for spec in args.clips:
            atlas, anim = spec.split(":")
            print("\n".join(stride(atlas, anim)[2]))
        return
    if args.mode == "images":
        out = images(args.ref, args.ours, args.width, args.grid)
    elif args.mode == "parallax":
        out = parallax(args.region if args.region.is_absolute() else ROOT / args.region, args.state, args.at)
        out = out.quantize(256, dither=Image.Dither.NONE)  # a review image, not art: keep it small in Git
    else:
        out, report = lineup(args.frames)
        print("\n".join(report))
    path = args.out if args.out.is_absolute() else ROOT / args.out
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)
    print(f"-> {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")


if __name__ == "__main__":
    main()
