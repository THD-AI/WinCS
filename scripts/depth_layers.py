"""Parallax layers for a painted stage chunk: a depth key from the model, masks from the key, fills behind.

    python scripts/depth_layers.py key   art/stages/<region> <chunk>   # API: repaint the chunk as flat depth colours
    python scripts/depth_layers.py masks art/stages/<region> <chunk>   # key -> one mask per layer (committed)
    python scripts/depth_layers.py fill  art/stages/<region> <chunk>   # API: paint what nearer layers hide
        [--only far mid] [--reuse]                                     # --reuse: re-cut from tmp/ paintings

1. key: the model repaints the composed chunk with one flat colour per depth band (DEPTH below), same
   composition. Raw output stays in tmp/boards/<region>/.
2. masks: every pixel snaps to the nearest key colour, small specks are voted away, and the sky/far
   edge is refined against the real pixels (the key drifts a few pixels at fine edges). Writes the
   parallax bands' masks, art/stages/<region>/masks/<chunk>.<layer>.png; layers.json uses them as
   "alpha" rules before its exact rules for rear, water, play and foreground, so
   split_layers.py still sends every pixel to exactly one layer and the stack rebuilds the art exactly.
3. fill: a layer that scrolls slower than the ones in front of it shows what they hid. For each such
   layer the model repaints the chunk with the nearer layers masked out, painting only that layer's
   scenery behind them; the result is kept only under the nearer layers (and below the layer's own
   skyline), so the composed picture at rest is unchanged. Writes layers/<chunk>.<layer>.filled.png.

Needs OPENAI_API_KEY (environment or .env) for key and fill; the key goes in a header file (make_boards.edit).
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_boards as mb  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
# Depth band -> (docs/04 layer, key colour). Order = back to front.
DEPTH = {
    "sky": ("00-sky", (0, 255, 255)),
    "far": ("01-far", (0, 0, 255)),
    "mid": ("02-mid", (0, 255, 0)),
    "rear": ("03-rear", (255, 255, 0)),
    "water": ("04-water", (0, 0, 128)),
    "play": ("05-play", (255, 0, 0)),
    "foreground": ("07-foreground", (255, 0, 255)),
}
BACK_TO_FRONT = list(DEPTH)
PARALLAX = ("sky", "far", "mid")  # the bands that scroll slower than the play layer

KEY_PROMPT = (
    "Repaint this exact image as a FLAT COLOUR DEPTH MAP for a 2D game's parallax layers. Keep every shape exactly "
    "where it is, pixel-aligned with the original, same size, no new objects. Fill each region with ONE flat colour, "
    "no shading, no outlines, no texture, no text:\n"
    "- the open sky and clouds: pure cyan #00FFFF\n"
    "- the hazy far tree line and distant forest on the horizon: pure blue #0000FF\n"
    "- the mid-distance autumn trees behind the reeds: pure green #00FF00\n"
    "- the reeds, bushes, stone walls and the big tree close behind the path: pure yellow #FFFF00\n"
    "- the walkable stone path, the bench and the wooden jetty with its posts: pure red #FF0000\n"
    "- the pond water with its reflections: navy #000080\n"
    "- the dark out-of-focus leaves and grass along the bottom edge, in front of everything: magenta #FF00FF\n"
    "Every pixel is exactly one of these seven colours.")

FILL_PROMPT = (
    "This is one chunk of a side-scrolling stage. Paint ONLY the transparent area, and paint there only {what}, "
    "continuing it naturally from what is visible around the hole: the same light, palette, fine 2-pixel grain and "
    "scale. Nothing that stands in front of it - no {front}. Strict side view, no characters, no text.")
WHAT = {
    "sky": ("the open late-afternoon sky with its clouds and the sun's glow", "trees, reeds, ground or water"),
    "far": ("the hazy far tree line and distant forest, down to the bottom of the transparent area",
            "near trees, reeds, walls, path or water"),
    "mid": ("the mid-distance autumn trees and their trunks, down to the bottom of the transparent area",
            "reeds, bushes, walls, path, bench, jetty or water"),
}


def snap(key: Image.Image) -> list[str]:
    """Each pixel of the key -> its depth band name (nearest key colour)."""
    colours = [DEPTH[name][1] for name in BACK_TO_FRONT]
    out = []
    for r, g, b in key.convert("RGB").getdata():
        best = min(range(len(colours)), key=lambda i: (r - colours[i][0]) ** 2 + (g - colours[i][1]) ** 2 + (b - colours[i][2]) ** 2)
        out.append(BACK_TO_FRONT[best])
    return out


def vote(bands: list[str], size: tuple[int, int], radius: int = 2) -> list[str]:
    """Remove specks: each band's mask is mode-filtered, the nearest band wins where several claim a pixel."""
    w, h = size
    masks = {}
    for name in BACK_TO_FRONT:
        m = Image.new("L", size)
        m.putdata([255 if b == name else 0 for b in bands])
        masks[name] = m.filter(ImageFilter.ModeFilter(2 * radius + 1))
    out = list(bands)
    data = {name: masks[name].getdata() for name in BACK_TO_FRONT}
    for i in range(w * h):
        claim = [name for name in BACK_TO_FRONT if data[name][i]]
        if claim:
            out[i] = claim[-1]
    return out


def skylike(px: tuple[int, int, int]) -> bool:
    """Sky and cloud colours in the style master's late afternoon: blue, pale blue, white, the warm sun glow.

    Measured on hg-0-0: open sky ≈ (40–60, 120–140, 240); the hazy far treetops ≈ (80, 120, 180) and
    (100, 120, 140) – blue, but never above 200 – so the blue test needs b > 200."""
    r, g, b = px
    return (b > 200 and b > r + 60) or (r > 200 and g > 200 and b > 180) or (r > 220 and g > 190 and b > 120 and b < r)


def refine(bands: list[str], art: Image.Image, reach: int = 6) -> list[str]:
    """The key drifts at fine edges: near the sky/far boundary, the real pixel's colour decides."""
    w, h = art.size
    rgb = art.convert("RGB").load()
    out = list(bands)
    def grown(band: str):
        m = Image.new("L", art.size)
        m.putdata([255 if b == band else 0 for b in bands])
        return m.filter(ImageFilter.MaxFilter(2 * reach + 1)).getdata()
    near_sky, near_tree = grown("sky"), {band: grown(band) for band in ("far", "mid", "rear")}
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not near_sky[i] or bands[i] not in ("sky", "far", "mid", "rear"):
                continue
            is_sky = skylike(rgb[x, y])
            if is_sky and bands[i] in ("far", "mid"):
                out[i] = "sky"  # a sky-coloured fringe on a tree top (the rear layer keeps its own: exact rules follow)
            elif not is_sky and bands[i] == "sky":
                # A treetop or leaf edge the key cut off – only right at trees, never a cloud rim or the sun's
                # glow. The nearest band wins (a leaf fringe of the big near tree belongs to the rear layer).
                tree = next((band for band in ("rear", "mid", "far") if near_tree[band][i]), None)
                if tree:
                    out[i] = tree
    return out


def write_masks(region: Path, chunk: str, bands: list[str], size: tuple[int, int]) -> list[Path]:
    folder = region / "masks"
    folder.mkdir(exist_ok=True)
    written = []
    for name in PARALLAX:  # the nearer layers come from exact rules in layers.json
        m = Image.new("L", size)
        m.putdata([255 if b == name else 0 for b in bands])
        if m.getbbox() is None:
            continue
        rgba = Image.new("RGBA", size, (255, 255, 255, 0))
        rgba.putalpha(m)
        path = folder / f"{chunk}.{DEPTH[name][0]}.png"
        rgba.save(path, optimize=True)
        written.append(path)
    return written


def art_for(region: Path, chunk: str) -> Image.Image:
    layers = json.loads((region / "layers.json").read_text(encoding="utf-8"))
    return Image.open(region / layers["chunks"][chunk]["states"]["clean"]).convert("RGB")


def raw_dir(region: Path) -> Path:
    folder = ROOT / "tmp" / "boards" / region.name
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def api(name: str, art: Image.Image, prompt: str, mask: Image.Image | None = None) -> Image.Image | None:
    key = mb.api_key()
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "art.png"
        art.save(path)
        mask_path = None
        if mask is not None:
            rgba = art.convert("RGBA")
            rgba.putalpha(mask.point(lambda v: 0 if v else 255))  # transparent = paint here
            mask_path = Path(folder) / "mask.png"
            rgba.save(mask_path)
        png = mb.edit(name, {"model": "gpt-image-2.5-sunburst", "prompt": prompt, "size": f"{art.width}x{art.height}"},
                      [path], key, mask=mask_path)
    return None if png is None else Image.open(io.BytesIO(png)).convert("RGB").resize(art.size, Image.Resampling.NEAREST)


def bands_from_layers(region: Path, chunk: str, size: tuple[int, int]) -> list[str]:
    """The split's own partition (split_layers.py wrote it from the masks and the exact rules)."""
    out = ["rear"] * (size[0] * size[1])
    for name in BACK_TO_FRONT:
        path = region / "layers" / f"{chunk}.{DEPTH[name][0]}.png"
        if path.exists():
            for i, a in enumerate(Image.open(path).getchannel("A").getdata()):
                if a:
                    out[i] = name
    return out


def skyline(own: list[bool], w: int, h: int, smooth: int = 12) -> list[int]:
    """Per column, the layer's top edge – defined everywhere, so its plate spans the whole chunk.

    Columns inside the layer's span without any of its pixels (hidden behind a nearer tree) take the
    nearest defined column's top, so the layer continues behind what stands in front of it; a running
    minimum over ±smooth px keeps single gaps from cutting a notch. Past the ends of the span there is
    no plate (h): the model would invent scenery there – on hg-0-0 it painted sun glow with a flat top –
    and a tree line that ends as the camera moves reads naturally."""
    raw = [min((y for y in range(h) if own[y * w + x]), default=None) for x in range(w)]
    known = [x for x in range(w) if raw[x] is not None]
    if not known:
        return [h] * w
    filled, j = [], 0
    for x in range(w):
        while j + 1 < len(known) and abs(known[j + 1] - x) <= abs(known[j] - x):
            j += 1
        filled.append(raw[x] if raw[x] is not None else raw[known[j]])
    tops = [min(filled[max(0, x - smooth):x + smooth + 1]) for x in range(w)]
    return [tops[x] if known[0] <= x <= known[-1] else h for x in range(w)]


def fill(region: Path, chunk: str, art: Image.Image, only: tuple[str, ...] = PARALLAX, reuse: bool = False) -> None:
    """For sky, far and mid: paint what the nearer layers hide, kept only there and below the layer's skyline."""
    w, h = art.size
    bands = bands_from_layers(region, chunk, art.size)
    for name in only:
        own = [b == name for b in bands]
        if not any(own):
            continue
        front = set(BACK_TO_FRONT[BACK_TO_FRONT.index(name) + 1:])
        top = [0] * w if name == "sky" else skyline(own, w, h)
        hole = Image.new("L", art.size)
        hole.putdata([255 if bands[y * w + x] in front and y >= top[x] else 0 for y in range(h) for x in range(w)])
        # The model gets a 2 px margin so no fringe of the nearer layer survives in its painting, but the
        # plate keeps the painting only on pixels the nearer layers own: never over a farther layer.
        prompt_hole = hole.filter(ImageFilter.MaxFilter(5))
        in_front = Image.new("L", art.size)
        in_front.putdata([255 if b in front else 0 for b in bands])
        what, nots = WHAT[name]
        raw = raw_dir(region) / f"{chunk}--fill-{name}.png"
        if reuse and raw.exists():  # masks changed, the painting didn't: cut the plate again without the API
            painted = Image.open(raw).convert("RGB")
        else:
            painted = api(f"{chunk}--fill-{name}", art, FILL_PROMPT.format(what=what, front=nots), prompt_hole)
            if painted is None:
                return
            painted.save(raw)
        plate = Image.new("RGBA", art.size)
        keep = Image.new("L", art.size)
        keep.putdata([255 if own[i] else 0 for i in range(w * h)])
        plate.paste(painted.convert("RGBA"), mask=ImageChops.multiply(prompt_hole, in_front))
        plate.paste(art.convert("RGBA"), mask=keep)  # its own pixels stay exactly the art's
        out = region / "layers" / f"{chunk}.{DEPTH[name][0]}.filled.png"
        plate.save(out, optimize=True)
        print(f"{chunk}: {name} filled -> {out.relative_to(ROOT)}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=["key", "masks", "fill"])
    parser.add_argument("region", type=Path)
    parser.add_argument("chunk")
    parser.add_argument("--only", nargs="+", choices=PARALLAX, default=list(PARALLAX), help="fill: these layers")
    parser.add_argument("--reuse", action="store_true", help="fill: cut the plates from the paintings in tmp/ again")
    args = parser.parse_args()
    region = args.region if args.region.is_absolute() else ROOT / args.region
    art = art_for(region, args.chunk)
    raw = raw_dir(region) / f"{args.chunk}--depth.png"
    if args.step == "key":
        key = api(f"{args.chunk}--depth", art, KEY_PROMPT)
        if key is None:
            sys.exit(1)
        key.save(raw)
        print(f"{args.chunk}: depth key -> {raw.relative_to(ROOT)}")
    elif args.step == "masks":
        if not raw.exists():
            sys.exit(f"{raw.relative_to(ROOT)} missing: run the key step first")
        bands = refine(vote(snap(Image.open(raw)), art.size), art)
        for path in write_masks(region, args.chunk, bands, art.size):
            print(f"{args.chunk}: mask -> {path.relative_to(ROOT)}")
    else:
        fill(region, args.chunk, art, tuple(args.only), args.reuse)


if __name__ == "__main__":
    main()
