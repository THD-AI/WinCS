"""Split composed stage chunks into the docs/04 layer stack, and prove the split is exact.

    art/stages/<region>/layers.json   chunks, their composed art per state, ordered mask rules
      -> every pixel of a chunk goes to exactly ONE layer (the last rule that claims it wins;
         unclaimed pixels go to the chunk's default layer)
      -> art/stages/<region>/layers/<chunk>.<layer>.png          when clean and anomaly agree
         art/stages/<region>/layers/<chunk>.<state>.<layer>.png  when the anomaly changes it
      -> check: stacking the layers z0..z7 rebuilds each composed state pixel for pixel

Because the layers never overlap, recomposition is exact by construction; the check proves the
files on disk still say so. A layer missing from a chunk is simply not written.

Mask rules, applied in order (coordinates in chunk pixels, x1/y1 exclusive):
    {"layer": "00-sky", "rect": [0, 0, 2160, 260]}
    {"layer": "04-water", "poly": [[0, 600], [2160, 600], [2160, 720], [0, 720]]}
    {"layer": "05-play", "colour": [70, 160, 150], "tolerance": 40, "rect": [0, 100, 2160, 620]}
    {"layer": "06-near", "alpha": "images/06-near-rails-left.png"}   # where that image is opaque
A rule can name "states": ["anomaly"] to apply to one state only.

Usage:
    python scripts/split_layers.py art/stages/hidden-garden     # write the layer files
    python scripts/split_layers.py --check                      # CI: every region still rebuilds exactly
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LAYERS = ("00-sky", "01-far", "02-mid", "03-rear", "04-water", "05-play", "06-near", "07-foreground")


class SplitError(Exception):
    """The config or the files on disk do not add up; the message says where."""


def mask_for(rule: dict, size: tuple[int, int], source: Image.Image, folder: Path) -> Image.Image:
    """The pixels one rule claims, as an L image (255 = claimed)."""
    w, h = size
    area = Image.new("L", size, 0)
    draw = ImageDraw.Draw(area)
    if "poly" in rule:
        draw.polygon([tuple(p) for p in rule["poly"]], fill=255)
    elif "rect" in rule or "colour" in rule:
        x0, y0, x1, y1 = rule.get("rect", [0, 0, w, h])
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=255)
    if "colour" in rule:
        r, g, b = rule["colour"]
        tol = rule.get("tolerance", 30)
        rgb = source.convert("RGB")
        near = Image.new("L", size, 0)
        near.putdata([255 if abs(pr - r) <= tol and abs(pg - g) <= tol and abs(pb - b) <= tol else 0
                      for pr, pg, pb in rgb.getdata()])
        area = ImageChops.multiply(area, near)
    if "alpha" in rule:
        other = Image.open(folder / rule["alpha"]).convert("RGBA")
        if other.size != size:
            raise SplitError(f"{rule['alpha']} is {other.size}, the chunk is {size}")
        area = other.getchannel("A").point(lambda a: 255 if a else 0)
    if not any(k in rule for k in ("rect", "poly", "colour", "alpha")):
        raise SplitError(f"a rule needs rect, poly, colour or alpha: {rule}")
    return area


def assign(chunk: dict, state: str, source: Image.Image, folder: Path) -> Image.Image:
    """An L image holding each pixel's layer index."""
    default = chunk.get("default", "02-mid")
    if default not in LAYERS:
        raise SplitError(f"unknown default layer {default!r}")
    owner = Image.new("L", source.size, LAYERS.index(default))
    for rule in chunk["rules"]:
        if rule["layer"] not in LAYERS:
            raise SplitError(f"unknown layer {rule['layer']!r}; use one of {', '.join(LAYERS)}")
        if state not in rule.get("states", [state]):
            continue
        owner.paste(LAYERS.index(rule["layer"]), mask=mask_for(rule, source.size, source, folder))
    return owner


def split(source: Image.Image, owner: Image.Image) -> dict[str, Image.Image]:
    """Cut the source into one RGBA image per layer that owns any pixel."""
    out = {}
    for index, name in enumerate(LAYERS):
        keep = owner.point(lambda v, i=index: 255 if v == i else 0)
        if not keep.getbbox():
            continue
        layer = Image.new("RGBA", source.size, (0, 0, 0, 0))
        layer.paste(source, mask=ImageChops.multiply(keep, source.getchannel("A")))
        out[name] = layer
    return out


def stack(layers: dict[str, Image.Image], size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    for name in LAYERS:
        if name in layers:
            canvas = Image.alpha_composite(canvas, layers[name])
    return canvas


def same(a: Image.Image, b: Image.Image) -> bool:
    return a.size == b.size and not ImageChops.difference(a.convert("RGBA"), b.convert("RGBA")).getbbox(alpha_only=False)


def files_for(chunk_id: str, states: dict[str, dict[str, Image.Image]]) -> dict[str, Image.Image]:
    """Layer file names: shared when every state has the identical layer, per state otherwise."""
    files = {}
    names = {n for layers in states.values() for n in layers}
    for name in names:
        images = [layers.get(name) for layers in states.values()]
        if all(i is not None for i in images) and all(same(images[0], i) for i in images[1:]):
            files[f"{chunk_id}.{name}.png"] = images[0]
        else:
            for state, layers in states.items():
                if name in layers:
                    files[f"{chunk_id}.{state}.{name}.png"] = layers[name]
    return files


def load(folder: Path, chunk_id: str, state: str, files: list[str]) -> dict[str, Image.Image]:
    """The layers of one chunk state from disk: its own files, else the shared ones."""
    out = {}
    for name in LAYERS:
        own, shared = f"{chunk_id}.{state}.{name}.png", f"{chunk_id}.{name}.png"
        pick = own if own in files else shared if shared in files else None
        if pick:
            out[name] = Image.open(folder / "layers" / pick).convert("RGBA")
    return out


def run(region: Path, check: bool) -> list[str]:
    config = json.loads((region / "layers.json").read_text(encoding="utf-8"))
    report = []
    for chunk_id, chunk in config["chunks"].items():
        sources = {s: Image.open(region / p).convert("RGBA") for s, p in chunk["states"].items()}
        sizes = {img.size for img in sources.values()}
        if len(sizes) != 1:
            raise SplitError(f"{chunk_id}: its states have different sizes {sizes}")
        size = sizes.pop()
        if check:
            on_disk = sorted(p.name for p in (region / "layers").glob(f"{chunk_id}.*.png"))
            for state, source in sources.items():
                if not same(stack(load(region, chunk_id, state, on_disk), size), source):
                    raise SplitError(f"{chunk_id}.{state}: the committed layers no longer rebuild "
                                     f"{chunk['states'][state]}; run split_layers.py again")
            report.append(f"{chunk_id}: {len(on_disk)} layer files rebuild {', '.join(sources)} exactly")
            continue
        states = {}
        for state, source in sources.items():
            layers = split(source, assign(chunk, state, source, region))
            if not same(stack(layers, size), source):  # cannot happen unless split() is broken
                raise SplitError(f"{chunk_id}.{state}: recomposition differs from the source")
            states[state] = layers
        files = files_for(chunk_id, states)
        out = region / "layers"
        out.mkdir(exist_ok=True)
        for old in out.glob(f"{chunk_id}.*.png"):
            if old.name not in files:
                old.unlink()
        for name, image in files.items():
            image.save(out / name, optimize=True)
        shared = sum(1 for n in files if n.count(".") == 2)
        report.append(f"{chunk_id}: {len(files)} layer files ({shared} shared by all states), exact")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="*", type=Path, help="region folders (default: every stage with a layers.json)")
    parser.add_argument("--check", action="store_true", help="only verify the committed layers rebuild the art")
    args = parser.parse_args()
    regions = args.regions or sorted(p.parent for p in (ROOT / "art" / "stages").glob("*/layers.json"))
    try:
        for region in regions:
            for line in run(region, args.check):
                print(line)
    except SplitError as error:
        sys.exit(f"split_layers: {error}")


if __name__ == "__main__":
    main()
