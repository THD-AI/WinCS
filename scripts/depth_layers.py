"""Parallax layers for a painted stage chunk: a depth key from the model, masks from the key, fills behind.

    python scripts/depth_layers.py key   art/stages/<region> <chunk>   # API: repaint the chunk as flat depth colours
    python scripts/depth_layers.py masks art/stages/<region> <chunk>   # key -> one mask per layer (committed)
        [--all]                                                        # every band (grown chunks), not only parallax
    python scripts/depth_layers.py collision art/stages/<region> <chunk>  # walk lines + water no-go from the key
    python scripts/depth_layers.py region art/stages/<region>          # quilt the chunks' slow layers into one plate each
    python scripts/depth_layers.py fill  art/stages/<region> <chunk>   # API: paint what nearer layers hide
    python scripts/depth_layers.py whole art/stages/<region> <chunk>   # API: a room's rear/water/play whole under
                                                                       # every nearer layer (rooms with no sky)
    python scripts/depth_layers.py bleed art/stages/<region> <chunk>   # scroll-1 layers' edges 16 px under nearer ones
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
   skyline), so the composed picture at rest is unchanged. Writes tmp/boards/<region>/filled/ (intermediates:
   the region plates below are quilted from them and committed).

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
    "- the reeds, bushes, stone walls, posts, benches, sheds, gates and the big trees close behind the path: "
    "pure yellow #FFFF00\n"
    "- ONLY what a person walks on - the path, a boardwalk or jetty deck, steps and terrace tops, the hill's "
    "ground, stepping stones, a roof you can stand on - as a solid band from its walking surface down to the "
    "water or the bottom: pure red #FF0000\n"
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


def write_masks(region: Path, chunk: str, bands: list[str], size: tuple[int, int],
                which: tuple[str, ...] = PARALLAX) -> list[Path]:
    """One mask per band. By default only the parallax bands: a hand-tuned chunk keeps exact rules for the rest;
    a grown chunk takes every band from its key (--all)."""
    folder = region / "masks"
    folder.mkdir(exist_ok=True)
    written = []
    for name in which:
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
    """A stage chunk's clean art (layers.json), or a world zone chunk's painted image (images/<chunk>.png)."""
    if not (region / "layers.json").exists():
        return Image.open(region / "images" / f"{chunk}.png").convert("RGB")
    layers = json.loads((region / "layers.json").read_text(encoding="utf-8"))
    return Image.open(region / layers["chunks"][chunk]["states"]["clean"]).convert("RGB")


# A world zone chunk away from pond level reads the same seven colours differently (docs/09 "World pipeline").
BAND_KEY = {
    "below": ("THIS CHUNK is underground, under the pond or the creek: ONLY the deep water at the very top and its surface "
              "hanging as a ceiling are navy - never a dark room, a doorway, a shadow or the dark behind the arches; "
              "every floor, ledge, step and the top of every girder you can walk on, as a solid band down from its "
              "walking surface, is red; everything behind you - the back walls, the dark insides of the rooms and "
              "arches, doors, crates, piers, ladders, pipes, rock and weed - is yellow; dark plants right at the "
              "bottom edge in front are magenta. There is no sky, no far forest and no mid trees here: no cyan, "
              "no blue, no green."),
}


def band_of(region: Path, chunk: str) -> str | None:
    """A world zone chunk's band (above, level, below); None for a stage chunk."""
    world = region / "world.json"
    return json.loads(world.read_text(encoding="utf-8"))["chunks"][chunk]["band"] if world.exists() else None


def key_prompt(region: Path, chunk: str) -> str:
    band = band_of(region, chunk)
    return KEY_PROMPT + ("\n\n" + BAND_KEY[band] if band in BAND_KEY else "")


def raw_dir(region: Path) -> Path:
    folder = ROOT / "tmp" / "boards" / region.name
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def api(name: str, art: Image.Image, prompt: str, mask: Image.Image | None = None,
        refs: tuple[Path, ...] = ()) -> Image.Image | None:
    """One gpt-image edit of `art` (the mask's white = paint here); `refs` go along as extra references."""
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
                      [path, *refs], key, mask=mask_path)
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
        out = raw_dir(region) / "filled" / f"{chunk}.{DEPTH[name][0]}.filled.png"  # an intermediate: not committed
        out.parent.mkdir(exist_ok=True)
        plate.save(out, optimize=True)
        print(f"{chunk}: {name} filled -> {out.relative_to(ROOT)}", flush=True)


# ---------------------------------------------------------------------------------------------------------
# Complete plates (docs/15 P2/P3, the "hot dog"): every layer rendered whole behind what stands in front of it.
# ---------------------------------------------------------------------------------------------------------
STYLE = ROOT / "art" / "direction" / "images" / "style-master.png"
# split_layers.py layer id -> band name; 06-near is the grass strip in front of the trail (no key colour:
# the "near" step paints it onto the art, it is not found in it).
BAND_OF = {layer: name for name, (layer, _) in DEPTH.items()} | {"06-near": "near"}
LAYER_OF = {band: layer for layer, band in BAND_OF.items()}
STACK = ["sky", "far", "mid", "rear", "water", "play", "near", "foreground"]  # split_layers.LAYERS order
LEVEL = ("rear", "water", "play")  # the bands at scroll 1: what the foreground and the near strip stand in front of

COMPLETE_PROMPT = (
    "This is one chunk of a side-scrolling stage. Paint ONLY the transparent area: {what}, continuing it "
    "naturally from what is visible around the hole, the same light, palette, fine 2-pixel grain and scale. Where "
    "the transparent area rises above that layer's own top edge, paint the plain late-afternoon sky there. Below "
    "its top edge it runs down to the bottom edge of the image as that layer alone - dense trunks and foliage - "
    "never a pond, water, a reflection or sky below the treetops. Nothing that stands in front of it - no {front}. "
    "Strict side view, no characters, no text. The second image is the style master: match its pixel-art rendering.")
UNDER_PROMPT = (
    "This is one chunk of a side-scrolling stage. The transparent area is where dark out-of-focus leaves and grass "
    "stood in front of the camera; they are removed. Paint ONLY the transparent area with what lies behind them, "
    "continued from what is visible around the hole: the pond water with its mirrored reflections and lily pads, "
    "the bank, the stone wall or the path's front face, the reeds - same light, palette, fine 2-pixel grain and "
    "scale. No leaves, no grass or plants in front, no characters, no text. The second image is the style master.")
NEAR_PROMPT = (
    "This is one chunk of a side-scrolling stage. The flat magenta band runs along the front edge of the walking "
    "path. Inside that band paint ONLY tufts of tall autumn grass, a few ferns, small plants and seed heads that "
    "grow up from the band's lower edge in front of the path, their tips reaching to the top of the band - in "
    "clumps with gaps between them, like the reeds and grass already in the picture, the same palette, light and "
    "fine 2-pixel grain. On wooden planks, stone steps, a jetty, a roof or stepping stones paint nothing. Every "
    "pixel of the band that is not a plant stays EXACTLY flat pure magenta #FF00FF. No characters, no text. The "
    "second image is the style master.")
MAGENTA = (255, 0, 255)


def partition(region: Path, chunk: str, source: Image.Image | None = None):
    """Each pixel's band, as split_layers.py assigns it from layers.json (H x W array of band names)."""
    import numpy as np
    import split_layers as sl
    config = json.loads((region / "layers.json").read_text(encoding="utf-8"))["chunks"][chunk]
    source = source or Image.open(region / config["states"]["clean"]).convert("RGBA")
    owner = np.array(sl.assign(config, "clean", source, region))
    names = np.array([BAND_OF.get(layer, "rear") for layer in sl.LAYERS])
    return names[owner]


def components(mask, smallest: int):
    """The mask without its specks: connected pieces under `smallest` px are dropped."""
    import numpy as np
    from scipy import ndimage
    labels, n = ndimage.label(mask)
    if not n:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= smallest
    return keep[labels]


def l_image(mask) -> Image.Image:
    import numpy as np
    return Image.fromarray(mask.astype(np.uint8) * 255)


def sky_array(rgb):
    """skylike() for a whole H x W x 3 array."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return ((b > 200) & (b > r + 60)) | ((r > 200) & (g > 200) & (b > 180)) | ((r > 220) & (g > 190) & (b > 120) & (b < r))


def complete(region: Path, chunk: str, art: Image.Image, only: tuple[str, ...] = ("far", "mid"),
             reuse: bool = False) -> None:
    """Far and mid rendered whole: painted under EVERY nearer pixel, down to the bottom, the layer's skyline drawn
    by the model (the sky it paints is dropped). The layer's own pixels stay the art's, so the chunk at rest is
    unchanged; the plate (tmp/.../filled/, the region plate's source) has no hard cut and no step."""
    import numpy as np
    from scipy import ndimage
    bands = partition(region, chunk)
    rgb = np.array(art.convert("RGB"))
    for name in only:
        own = bands == name
        if not own.any():
            continue
        front = np.isin(bands, STACK[STACK.index(name) + 1:])
        raw = raw_dir(region) / f"{chunk}--complete-{name}.png"
        if reuse and raw.exists():
            painted = Image.open(raw).convert("RGB")
        else:
            what, nots = WHAT[name]
            # A 2 px margin into the layer's own edge, so no fringe of the nearer layer survives in the painting.
            hole = ndimage.binary_dilation(front, iterations=2)
            for _ in range(3):  # the model sometimes hands back the window empty (exact black): paint it again
                painted = api(f"{chunk}--complete-{name}", art, COMPLETE_PROMPT.format(what=what, front=nots),
                              l_image(hole), (STYLE,))
                if painted is None or (np.array(painted)[hole].sum(1) == 0).mean() < 0.05:
                    break
                print(f"{chunk}: {name} came back empty, painting again", flush=True)
            if painted is None:
                return
            painted.save(raw)
        p = np.array(painted)
        # The painting is kept on nearer pixels only (never over a farther layer), and only where it is not sky;
        # a 3x3 majority smooths the sky cut, specks and pieces cut off from the layer go.
        keep = front & ~sky_array(p)
        keep = ndimage.median_filter(keep.astype(np.uint8), size=3).astype(bool) & front
        keep &= components(keep | own, 600)
        plate = np.zeros((*own.shape, 4), np.uint8)
        plate[keep, :3], plate[keep, 3] = p[keep], 255
        plate[own, :3], plate[own, 3] = rgb[own], 255  # its own pixels stay exactly the art's
        out = raw_dir(region) / "filled" / f"{chunk}.{DEPTH[name][0]}.filled.png"
        out.parent.mkdir(exist_ok=True)
        Image.fromarray(plate).save(out, optimize=True)
        print(f"{chunk}: {name} complete -> {out.relative_to(ROOT)}", flush=True)


def before_near(region: Path, chunk: str) -> Path:
    """The chunk's art before the near strip was painted on (kept in tmp/; the under step paints from it)."""
    return raw_dir(region) / f"{chunk}--before-near.png"


def trail_top(bands, smooth: int = 9):
    """Per column, the first row of the trail band (-1 where the column has none); a running median steadies it."""
    import numpy as np
    from scipy import ndimage
    play = components(bands == "play", 200)
    has = play.any(axis=0)
    top = np.where(has, play.argmax(axis=0), 10_000)
    med = ndimage.median_filter(top, size=smooth, mode="nearest")
    return np.where(has & (med < 10_000), med, -1)


def walk_top(region: Path, chunk: str, w: int, shortest: int = 200):
    """Per column, the trail's walking line from the chunk's collision (-1 where none): where several lines cover
    a column the longest wins (the trail, not a shed roof); lines under `shortest` px (a hollow's floor,
    stepping stones, a ledge) grow no grass."""
    import numpy as np
    path = region / f"{chunk}.clean.collision.json"
    if not path.exists():
        return None
    top, span = np.full(w, -1), np.zeros(w)
    for line in json.loads(path.read_text(encoding="utf-8")).get("walk", []):
        xs, ys = [p[0] for p in line], [p[1] for p in line]
        length = xs[-1] - xs[0]
        if length < shortest:
            continue
        cols = np.arange(max(0, xs[0]), min(w, xs[-1]))
        better = span[cols] < length
        top[cols[better]] = np.round(np.interp(cols[better], xs, ys)).astype(int)
        span[cols[better]] = length
    return top


def near_band(bands, above: int = 30, below: int = 14, top=None):
    """Where the near strip may grow: from `below` px under the trail's top to `above` px over it."""
    import numpy as np
    h, w = bands.shape
    top = trail_top(bands) if top is None else top
    rows = np.arange(h)[:, None]
    return (top[None, :] >= 0) & (rows >= top[None, :] - above) & (rows < top[None, :] + below)


def match_hue(p, plant, reference, limit: float = 40.0):
    """The `plant` pixels of `p` (H x W x 3, ints) with their hues rotated so their saturated mean hue meets that of
    `reference` (N x 3: the chunk's own art under the strip, before it was painted), by at most `limit` degrees;
    value and saturation stay. Pinks, which the garden doesn't have, are pulled toward red."""
    import colorsys
    import numpy as np

    def mean_hue(pixels):
        hsv = [colorsys.rgb_to_hsv(*(c / 255 for c in px)) for px in pixels[::5]]
        angles = [h * 2 * np.pi for h, sat, _ in hsv if sat > 0.25]
        if not angles:
            return None
        return np.degrees(np.arctan2(np.mean(np.sin(angles)), np.mean(np.cos(angles))))

    target, current = mean_hue(reference), mean_hue(p[plant])
    if target is None or current is None:
        return p[plant]
    shift = ((target - current + 180) % 360 - 180)
    shift = max(-limit, min(limit, shift)) / 360
    out = []
    for r, g, b in p[plant]:
        h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        h = (h + shift) % 1.0
        # The garden has no pink: a pink-magenta plant (300-360 degrees) is pulled 70 % of the way to red.
        if h > 300 / 360:
            h = (h + (1.0 - h) * 0.7) % 1.0
        out.append([round(c * 255) for c in colorsys.hsv_to_rgb(h, sat, v)])
    return np.array(out, dtype=p.dtype).reshape(-1, 3)


def near(region: Path, chunk: str, reuse: bool = False) -> Path | None:
    """The grass strip in front of the trail (06-near, drawn over the hero's feet). The model paints plants into a
    flat magenta band along the trail's front edge; what is not magenta and rises over the trail becomes the
    strip. Writes its mask (masks/<chunk>.06-near.png) and paints it onto the chunk's art; the art before it
    stays in tmp/."""
    import numpy as np
    from scipy import ndimage
    config = json.loads((region / "layers.json").read_text(encoding="utf-8"))["chunks"][chunk]
    art_path = region / config["states"]["clean"]
    keep_art = before_near(region, chunk)
    if not keep_art.exists():
        Image.open(art_path).convert("RGB").save(keep_art)
    art = Image.open(keep_art).convert("RGB")
    bands = partition(region, chunk, art.convert("RGBA"))
    top = walk_top(region, chunk, art.width)
    if top is None:
        top = trail_top(bands)
    band = near_band(bands, top=top)
    rgb = np.array(art)
    raw = raw_dir(region) / f"{chunk}--near.png"
    if reuse and raw.exists():
        painted = Image.open(raw).convert("RGB")
    else:
        guide = rgb.copy()
        guide[band] = MAGENTA
        painted = api(f"{chunk}--near", Image.fromarray(guide), NEAR_PROMPT, l_image(band), (STYLE,))
        if painted is None:
            return None
        painted.save(raw)
    p = np.array(painted).astype(int)
    r, g, b = p[..., 0], p[..., 1], p[..., 2]
    key = (r > 200) & (b > 200) & (g < 90)  # the flat magenta
    fringe = ((r + b) / 2 - g > 110) & (b > 110)  # its blends at the plants' edges
    plant = ndimage.binary_opening(band & ~key & ~fringe, iterations=1)
    plant = components(plant, 24)
    # Decontaminate: a plant pixel tinted by the magenta takes the colour of the nearest clean plant pixel.
    tinted = plant & (b > g + 30) & (r > g + 30)
    clean = plant & ~tinted
    if tinted.any() and clean.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~clean, return_indices=True)
        p[tinted] = p[iy[tinted], ix[tinted]]
    # The model paints the strip redder than the garden; turn its hues to the foliage around the trail.
    p[plant] = match_hue(p, plant, rgb[band].astype(int))
    # Only plants that rise over the trail's top count; the rest would just repaint the path's front face.
    rows = np.arange(plant.shape[0])[:, None]
    labels, n = ndimage.label(plant)
    rising = np.zeros(n + 1, bool)
    if n:
        rising[np.unique(labels[plant & (rows < top[None, :] - 2)])] = True
        rising[0] = False
    plant = rising[labels]
    mask = Image.new("RGBA", art.size, (255, 255, 255, 0))
    mask.putalpha(l_image(plant))
    out = region / "masks" / f"{chunk}.06-near.png"
    mask.save(out, optimize=True)
    composed = rgb.copy()
    composed[plant] = p[plant]
    Image.fromarray(composed.astype(np.uint8)).save(art_path, optimize=True)
    print(f"{chunk}: near strip ({int(plant.sum())} px) -> {out.relative_to(ROOT)}, painted onto "
          f"{art_path.relative_to(ROOT)}", flush=True)
    return out


def under(region: Path, chunk: str, reuse: bool = False) -> list[Path]:
    """The scroll-1 layers (rear, water, play) rendered whole under the foreground and the near strip.

    Under the near strip the art from before it (tmp/) is exact; under the foreground the model repaints the
    chunk without it. Each hole pixel goes to the band its column continues from above (water stays water, the
    path's face stays path) and is written as that layer's fill, fills/<chunk>.<layer>.png, which split_layers.py
    puts under the layer wherever a nearer layer owns the pixel - so the chunk rebuilds exactly at rest and
    shows no hole when the foreground slides."""
    import numpy as np
    from scipy import ndimage
    config = json.loads((region / "layers.json").read_text(encoding="utf-8"))["chunks"][chunk]
    base = before_near(region, chunk)
    art = Image.open(base if base.exists() else region / config["states"]["clean"]).convert("RGB")
    bands = partition(region, chunk)
    fg, near_px = bands == "foreground", bands == "near"
    fill = np.array(art)
    if fg.any():
        raw = raw_dir(region) / f"{chunk}--under.png"
        if reuse and raw.exists():
            painted = Image.open(raw).convert("RGB")
        else:
            painted = api(f"{chunk}--under", art, UNDER_PROMPT, l_image(ndimage.binary_dilation(fg, iterations=3)),
                          (STYLE,))
            if painted is None:
                return []
            painted.save(raw)
        fill[fg] = np.array(painted)[fg]
    owner = continuation(bands, fg | near_px)
    folder = region / "fills"
    folder.mkdir(exist_ok=True)
    written = []
    h, w = bands.shape
    for name in LEVEL:
        m = owner == name
        path = folder / f"{chunk}.{LAYER_OF[name]}.png"
        if not m.any():
            path.unlink(missing_ok=True)
            continue
        plate = np.zeros((h, w, 4), np.uint8)
        plate[m, :3], plate[m, 3] = fill[m], 255
        Image.fromarray(plate).save(path, optimize=True)
        written.append(path)
        print(f"{chunk}: {name} under-fill ({int(m.sum())} px) -> {path.relative_to(ROOT)}", flush=True)
    return written


# A room under the ground (no sky, nothing scrolls slower): what each scroll-1 layer continues as behind what stands
# in front of it, and what must not be painted there.
WHOLE = {
    "rear": ("the room's back wall - its masonry, concrete, arches, piers, pipes or rock, whatever the wall around "
             "the hole is made of, with its lanterns' light, closed and lit like the wall around it",
             "floors, ledges, girders, ladders, water, weeds or plants, and no new openings, pipe mouths or black holes"),
    "water": ("the deep water with its light and its dark, the same water as around the hole",
              "floors, ledges, girders, ladders, weeds or plants"),
    "play": ("the floors, walkways, ledges and girders, continued as they run", "weeds, plants or grass"),
}
WHOLE_REACH = 96  # water and floor continue this far behind what stands in front of them
BLACK = 6          # a channel maximum under this is flat black
BLACK_VOID = 600   # a flat-black blob this big in the painted window is a hole or a made-up opening: paint again


def black_void(painted, window) -> int:
    """The biggest flat-black blob (4-connected, px) the model painted inside the window. Thin dark outlines are art;
    a blob is an empty window or an invented opening (hg-3-1's back wall came back with a black pipe mouth behind a
    girder). Plain numpy flood fill: CI has no scipy."""
    import numpy as np
    black = (np.asarray(painted).max(2) < BLACK) & np.asarray(window, bool)
    seen, best = np.zeros_like(black), 0
    for y, x in zip(*np.nonzero(black)):
        if seen[y, x]:
            continue
        stack, size = [(y, x)], 0
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            size += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < black.shape[0] and 0 <= nx < black.shape[1] and black[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        best = max(best, size)
    return best
WHOLE_PROMPT = (
    "This is one chunk of a side-scrolling stage: a room under the ground. Paint ONLY the transparent area: {what}, "
    "continuing it from what is visible around the hole - the same light, palette, fine 2-pixel grain and scale. "
    "Nothing that stands in front of it - no {front}. No sky. Strict side view, no characters, no text. The second "
    "image is the style master: match its pixel-art rendering.")


def whole(region: Path, chunk: str, art: Image.Image, reuse: bool = False) -> list[Path]:
    """A room's scroll-1 layers (rear, water, play) rendered whole under EVERY nearer layer: the back wall behind the
    floors, the water and the weeds; the water behind the girders and the weeds; the floor behind the weeds. Each is
    one model painting of the chunk with the nearer pixels transparent, kept only on those pixels and written as the
    layer's fill (fills/<chunk>.<layer>.png), which split_layers.py puts under the layer where a nearer layer owns the
    pixel: the chunk rebuilds exactly at rest, and no layer shows a hole when the weeds sway, the water ripples or a
    layer is shown alone (debug mode). For rooms with no sky; the garden's own chunks use fill/complete/under."""
    import numpy as np
    from scipy import ndimage
    bands = partition(region, chunk)
    folder = region / "fills"
    folder.mkdir(exist_ok=True)
    written = []
    for name in LEVEL:
        own, front = bands == name, np.isin(bands, STACK[STACK.index(name) + 1:])
        path = folder / f"{chunk}.{DEPTH[name][0]}.png"
        if not own.any() or not front.any():
            path.unlink(missing_ok=True)
            continue
        raw = raw_dir(region) / f"{chunk}--whole-{name}.png"
        if reuse and raw.exists():
            painted = Image.open(raw).convert("RGB")
        else:
            what, nots = WHOLE[name]
            # 2 px into the layer's own edge, so no fringe of the nearer layer survives in the painting
            hole = ndimage.binary_dilation(front, iterations=2)
            for _ in range(3):  # flat black in the window is a hole or a void the model made up: paint it again
                painted = api(f"{chunk}--whole-{name}", art, WHOLE_PROMPT.format(what=what, front=nots),
                              l_image(hole), (STYLE,))
                void = 0 if painted is None else black_void(painted, front)
                if void <= BLACK_VOID:
                    break
                print(f"{chunk}: {name} came back with a {void} px black void, painting again", flush=True)
            if painted is None:
                continue
            painted.save(raw)
        # The back wall is behind everything in a room. Water and floor only go on where they plausibly run: within
        # WHOLE_REACH px of their own pixels (the water behind a girder, the floor behind its weeds) - never water
        # under a dry cellar's floors.
        keep = front if name == "rear" else front & (ndimage.distance_transform_edt(~own) <= WHOLE_REACH)
        plate = np.zeros((*own.shape, 4), np.uint8)
        plate[keep, :3], plate[keep, 3] = np.array(painted)[keep], 255
        Image.fromarray(plate).save(path, optimize=True)
        written.append(path)
        print(f"{chunk}: {name} whole ({int(keep.sum())} px behind nearer layers) -> {path.relative_to(ROOT)}", flush=True)
    return written


def bleed_plate(rgb, own, front, plate, reach: int = 16):
    """The fill plate with the layer grown `reach` px into the `front` pixels, one pixel ring per step, each new pixel
    taking a neighbour's colour (an existing, painted fill wins). Plain numpy: CI has no scipy. Returns (plate,
    pixels added)."""
    import numpy as np
    colour, have = rgb.copy(), own.copy()
    open_ = front & (plate[..., 3] == 0)
    added = np.zeros_like(own)
    for _ in range(reach):
        grew = np.zeros_like(have)
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            src_have, src_col = np.roll(have, step, axis), np.roll(colour, step, axis)
            if axis == 0:   # no wrap-around from the opposite edge
                (src_have[:1] if step > 0 else src_have[-1:])[...] = False
            else:
                (src_have[:, :1] if step > 0 else src_have[:, -1:])[...] = False
            take = open_ & ~have & ~grew & src_have
            colour[take] = src_col[take]
            grew |= take
        if not grew.any():
            break
        have |= grew
        added |= grew
    plate = plate.copy()
    plate[added, :3], plate[added, 3] = colour[added], 255
    return plate, int(added.sum())


def bleed(region: Path, chunk: str, reach: int = 16) -> list[Path]:
    """Every scroll-1 layer (rear, water, play) continues its own edge pixels `reach` px into the pixels a nearer
    layer owns, merged under its fill (fills/<chunk>.<layer>.png): the ripple samples the water a few px off its
    own pixels, and a swaying edge uncovers a sliver of what is behind it - which is then the layer's own colour,
    never the hole. At rest the chunk is unchanged (split_layers.py puts fills only under nearer layers)."""
    import numpy as np
    from scipy import ndimage
    config = json.loads((region / "layers.json").read_text(encoding="utf-8"))["chunks"][chunk]
    rgb = np.array(Image.open(region / config["states"]["clean"]).convert("RGB"))
    bands = partition(region, chunk)
    folder = region / "fills"
    folder.mkdir(exist_ok=True)
    written = []
    for name in LEVEL:
        own, front = bands == name, np.isin(bands, STACK[STACK.index(name) + 1:])
        if not own.any() or not front.any():
            continue
        path = folder / f"{chunk}.{DEPTH[name][0]}.png"
        plate = np.array(Image.open(path).convert("RGBA")) if path.exists() else np.zeros((*own.shape, 4), np.uint8)
        plate, added = bleed_plate(rgb, own, front, plate, reach)
        Image.fromarray(plate).save(path, optimize=True)
        written.append(path)
        print(f"{chunk}: {name} bleeds {added} px under nearer layers -> {path.relative_to(ROOT)}", flush=True)
    return written


def continuation(bands, hole):
    """Per hole pixel, the scroll-1 band its column continues from: the nearest one above, else below, else rear."""
    import numpy as np
    h, w = bands.shape
    level = np.where(np.isin(bands, LEVEL), bands, "")
    owner = np.full(bands.shape, "", dtype="<U5")
    for x in range(w):
        col, hcol = level[:, x], hole[:, x]
        if not hcol.any():
            continue
        last = ""
        for y in range(h):
            if col[y]:
                last = col[y]
            elif hcol[y]:
                owner[y, x] = last
        nxt = ""
        for y in range(h - 1, -1, -1):
            if col[y]:
                nxt = col[y]
            elif hcol[y] and not owner[y, x]:
                owner[y, x] = nxt or "rear"
    return owner


CLEAR_PROMPT = (
    "This is one chunk of a side-scrolling stage. Paint ONLY the transparent area: the open late-afternoon sky with "
    "its clouds and, lower down, the hazy far forest and the mid-distance autumn trees continuing exactly from what is "
    "visible around the hole - same light, palette, fine 2-pixel grain and scale. No overhanging branches, no leaves "
    "hanging from above, nothing cut off. No characters, no text. The second image is the style master.")


def hanging(bands, reach: int = 320):
    """Overhead canopy pieces that hang from nothing: rear-band pieces touching the chunk's top edge that end
    above `reach` px (a whole tree reaches the ground). The grown chunks got them from feature repaints; they
    show as foliage with a straight cut once the layers move."""
    import numpy as np
    from scipy import ndimage
    labels, n = ndimage.label(bands == "rear")
    out = np.zeros(bands.shape, bool)
    for i, box in enumerate(ndimage.find_objects(labels), 1):
        if box and box[0].start == 0 and box[0].stop < reach:
            out[box] |= labels[box] == i
    return out


def clear(region: Path, chunk: str, reuse: bool = False) -> None:
    """Paint the hanging canopy pieces out of the chunk's art (sky, far and mid continue there) and give their
    pixels to sky, far or mid: sky where the painting is sky-coloured, else the nearer of the far and mid bands
    around. Writes the art (the original stays in tmp/) and the sky/far/mid masks."""
    import numpy as np
    from scipy import ndimage
    config = json.loads((region / "layers.json").read_text(encoding="utf-8"))["chunks"][chunk]
    art_path = region / config["states"]["clean"]
    keep_art = raw_dir(region) / f"{chunk}--before-clear.png"
    if not keep_art.exists():
        Image.open(art_path).convert("RGB").save(keep_art)
    bands = partition(region, chunk, Image.open(keep_art).convert("RGBA"))
    hang = hanging(bands)
    if not hang.any():
        print(f"{chunk}: nothing hangs", flush=True)
        return
    hole = ndimage.binary_dilation(hang, iterations=3) & np.isin(bands, ("sky", "far", "mid", "rear"))
    art = Image.open(art_path).convert("RGB")
    raw = raw_dir(region) / f"{chunk}--clear.png"
    if reuse and raw.exists():
        painted = Image.open(raw).convert("RGB")
    else:
        painted = api(f"{chunk}--clear", art, CLEAR_PROMPT, l_image(hole), (STYLE,))
        if painted is None:
            return
        painted.save(raw)
    p, rgb = np.array(painted), np.array(art)
    rgb[hole] = p[hole]
    Image.fromarray(rgb).save(art_path, optimize=True)
    sky = hole & sky_array(p)
    d_far = ndimage.distance_transform_edt(~((bands == "far") & ~hole))
    d_mid = ndimage.distance_transform_edt(~((bands == "mid") & ~hole))
    new = bands.copy()
    new[hole & ~sky] = np.where(d_far[hole & ~sky] < d_mid[hole & ~sky], "far", "mid")
    new[sky] = "sky"
    for name in ("sky", "far", "mid"):
        path = region / "masks" / f"{chunk}.{DEPTH[name][0]}.png"
        mask = Image.new("RGBA", art.size, (255, 255, 255, 0))
        mask.putalpha(l_image(new == name))
        mask.save(path, optimize=True)
    print(f"{chunk}: cleared {int(hang.sum())} px of hanging canopy -> {art_path.relative_to(ROOT)}", flush=True)


def rdp(points: list[tuple[int, int]], tolerance: float) -> list[tuple[int, int]]:
    """Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` px of the traced line."""
    if len(points) < 3:
        return points
    (x0, y0), (x1, y1) = points[0], points[-1]
    length = max(1e-9, ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5)
    far, at = 0.0, 0
    for i, (x, y) in enumerate(points[1:-1], 1):
        d = abs((y1 - y0) * x - (x1 - x0) * y + x1 * y0 - y1 * x0) / length
        if d > far:
            far, at = d, i
    if far <= tolerance:
        return [points[0], points[-1]]
    return rdp(points[:at + 1], tolerance)[:-1] + rdp(points[at:], tolerance)


def surfaces(bands: list[str], w: int, h: int, x: int, every: bool = False) -> list[int]:
    """Where the play band starts in column x: its top only, or (every) each start below something else.

    The top only by default: grass and bushes keyed in front of a hill punch holes into its play band,
    and their lower edges are not floors. A real second floor (a hollow under the path) is measured by
    hand and comes from the board's "walkExtra"."""
    tops = [y for y in range(h) if bands[y * w + x] == "play" and (y == 0 or bands[(y - 1) * w + x] != "play")]
    return tops if every else tops[:1]


def ramp(line: list[tuple[int, int]], rise: int, slope: float = 0.7) -> list[tuple[int, int]]:
    """Stairs are walk slopes, never steps (docs/13): each jump of up to `rise` px becomes a ramp of about 35°."""
    pts = list(line)
    for k in range(1, len(pts)):
        dy = pts[k][1] - pts[k - 1][1]
        if 1 < abs(dy) <= rise:
            half = max(1, round(abs(dy) / slope / 2))
            a, b = max(0, k - half), min(len(pts) - 1, k + half - 1)
            ya, yb = pts[a][1], pts[b][1]
            for m in range(a, b + 1):
                pts[m] = (pts[m][0], round(ya + (yb - ya) * (m - a) / max(1, b - a)))
    return pts


def walk_lines(bands: list[str], w: int, h: int, step: int = 48, tolerance: float = 2.0, shortest: int = 24,
               every: bool = False) -> list:
    """The walkable surfaces of the play band, followed column by column.

    A surface continues into the next column at the nearest height within `step` px (a terrace step,
    turned into a ramp); anything further starts a new line. Several surfaces may share a column (the
    path over a hollow)."""
    active: list[list[tuple[int, int]]] = []
    done: list[list[tuple[int, int]]] = []
    for x in range(w):
        here = surfaces(bands, w, h, x, every)
        nxt = []
        for line in active:
            y0 = line[-1][1]
            near = min(here, key=lambda y: abs(y - y0), default=None)
            if near is not None and abs(near - y0) <= step:
                line.append((x, near))
                here.remove(near)
                nxt.append(line)
            else:
                done.append(line)
        nxt += [[(x, y)] for y in here]
        active = nxt
    done += active
    out = []
    for line in sorted((l for l in done if len(l) >= shortest), key=lambda l: (l[0][0], l[0][1])):
        pts = rdp(ramp(line, step), tolerance)
        pts[-1] = (pts[-1][0] + 1, pts[-1][1])  # the line covers its last column
        out.append([[x, y] for x, y in pts])
    return out


def collision(region: Path, chunk: str, art: Image.Image) -> Path:
    """Walk lines traced from the key's play band and the water as no-go; hand-placed fields are kept."""
    w, h = art.size
    raw = raw_dir(region) / f"{chunk}--depth.png"
    bands = vote(snap(Image.open(raw).resize(art.size, Image.Resampling.NEAREST)), art.size)
    path = region / f"{chunk}.clean.collision.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {
        "chunk": chunk, "state": "clean", "size": [w, h], "walk": [], "slide": [], "oneWay": [], "climb": [],
        "solid": [], "noGo": [], "hazard": [], "interact": [], "spawn": [], "ledge": [], "glideLift": []}
    board = next((b for b in json.loads((region / "boards.json").read_text(encoding="utf-8"))["boards"]
                  if b["id"] == chunk), {})
    if "terrain" not in data:  # a typed chunk was re-authored by hand from the art: its floors stay
        data["walk"] = walk_lines(bands, w, h) + board.get("walkExtra", [])
    water = [y for y in range(h) for x in range(0, w, 8) if bands[y * w + x] == "water"]
    # The pond is never floor (docs/04 terrain): a water no-go, which splashes and respawns at the bank.
    data["noGo"] = [{"x": 0, "y": min(water), "w": w, "h": h - min(water), "kind": "water"}] if water else []
    path.write_text(json.dumps(data, separators=(", ", ": ")) + "\n", encoding="utf-8")
    return path


def seam_path(a: Image.Image, b: Image.Image) -> list[int]:
    """Per row, the column of least difference between two RGBA strips; moves at most one column a row."""
    w, h = a.size
    pa, pb = a.load(), b.load()
    diff = [[sum(abs(pa[x, y][c] - pb[x, y][c]) for c in range(4)) for x in range(w)] for y in range(h)]
    cost = [diff[0][:]]
    for y in range(1, h):
        prev = cost[-1]
        cost.append([diff[y][x] + min(prev[max(0, x - 1):x + 2]) for x in range(w)])
    x = min(range(w), key=lambda i: cost[-1][i])
    path = [x]
    for y in range(h - 2, -1, -1):
        x = min(range(max(0, x - 1), min(w, x + 2)), key=lambda i: cost[y][i])
        path.append(x)
    return path[::-1]


def blended_plate(plates: list[Image.Image], scroll: float, blend: int) -> Image.Image:
    """Region plate for an opaque, soft layer (the sky): neighbouring plates cross-fade over `blend` px in the
    middle of their overlap - a cut through clouds shows as a step, a fade does not."""
    import numpy as np
    w, h = plates[0].size
    step = round(w * scroll)
    strip = np.zeros((h, step * (len(plates) - 1) + w, 4), float)
    strip[:, :w] = np.asarray(plates[0], float)
    for i, plate in enumerate(plates[1:], 1):
        o, q = i * step, np.asarray(plate, float)
        centre = (w - step) / 2
        t = np.clip((np.arange(w) - (centre - blend / 2)) / max(1, blend), 0, 1) if step < w else np.ones(w)
        t = t[None, :, None]
        strip[:, o:o + w] = strip[:, o:o + w] * (1 - t) + q * t
    return Image.fromarray(np.round(strip).astype(np.uint8))


def region_plate(plates: list[Image.Image], scroll: float, window: int = 192, carry: bool = False) -> Image.Image:
    """One plate for a row of chunks at scroll != 1: chunk i's plate sits at i * W * scroll.

    Slower than 1, neighbouring chunk plates overlap by W * (1 - scroll) and would cut each other off with
    hard vertical edges; each next plate takes over along the least visible path through a `window` px band
    just right of where it starts, and only where it has pixels (past its own tree line the earlier plate
    shows on). Faster than 1 (a foreground), they spread apart by W * (scroll - 1): the gap is filled with
    the earlier plate's last columns mirrored, which meets it without a seam, and the next plate takes over
    from there the same way."""
    w, h = plates[0].size
    step = round(w * scroll)
    strip = Image.new("RGBA", (step * (len(plates) - 1) + w, h))
    strip.paste(plates[0], (0, 0))
    for i, plate in enumerate(plates[1:], 1):
        o = i * step
        prev_end = (i - 1) * step + w
        if o > prev_end:  # a gap: mirror the strip's last columns into it, plus a window to cut through
            g = o - prev_end + window
            mirrored = strip.crop((prev_end - g, 0, prev_end, h)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            strip.paste(mirrored, (prev_end, 0))
        k = min(window, max(1, w - step) if step < w else window)
        cut = seam_path(strip.crop((o, 0, o + k, h)), plate.crop((0, 0, k, h)))
        s, q = strip.load(), plate.load()
        # With carry, a column where the plate has no pixels at all (past its own tree line) keeps the
        # earlier plate (mid trees: no holes). Every other column is the plate's own, transparency included,
        # so its chunk at rest looks exactly like its art. Without carry, open sky shows there instead.
        empty = [carry and all(q[x, y][3] == 0 for y in range(h)) for x in range(w)]
        for y in range(h):
            for x in range(cut[y], w):
                if not empty[x] or o > prev_end:
                    s[o + x, y] = q[x, y]
    return strip


def region_layers(region: Path) -> list[Path]:
    """Quilt every layer marked "region" in export.json from its chunks' "rest" plates into one plate each."""
    export = json.loads((region / "export.json").read_text(encoding="utf-8"))
    # The level row only: a row above or below is rooms, with no plates that scroll slower (export_stage skips them)
    chunks = sorted(((c, ch) for c, ch in export["chunks"].items() if ch.get("y", 0) == 0), key=lambda kv: kv[1]["x"])
    aliases = json.loads((region / export["aliases"]).read_text(encoding="utf-8")).get("aliases", {})         if export.get("aliases") else {}

    def rest(layer: dict, chunk_id: str, chunk: dict) -> Path:
        """A chunk's own plate for a region layer; a shared plate (an alias, "= left") resolves to its file."""
        path = ROOT / layer["rest"].format(name=chunk.get("name", chunk_id))
        return path if path.exists() or path.name not in aliases else path.parent / aliases[path.name]
    written = []
    for layer_id, layer in export["layers"].items():
        if not layer.get("region"):
            continue
        plates = [Image.open(rest(layer, c, chunk)).convert("RGBA") for c, chunk in chunks]
        if layer.get("blend"):
            plate = blended_plate(plates, layer["scroll"], layer["blend"])
        else:
            plate = region_plate(plates, layer["scroll"], carry=layer.get("carry", False))
        # A preview-free game plate: 256 colours keep it small; --verify checks the chunks' own plates ("rest").
        alpha = plate.getchannel("A")
        plate = plate.convert("RGB").quantize(256, dither=Image.Dither.NONE).convert("RGBA")
        plate.putalpha(alpha)
        # Tile j (2160 px of the plate) is carried by chunk j: a layer at chunk.x * 2160 moving at its scroll
        # factor then shows exactly the plate's column the camera is over, with any loader that places
        # layers at their chunk's origin - and no file is wider than a chunk.
        w, n = plates[0].width, len(plates)
        (region / "layers").mkdir(exist_ok=True)
        for old in (region / "layers").glob(f"{region.name}.{layer_id}.*.png"):
            old.unlink()
        for j in range(min(n, -(-plate.width // w))):
            # The last chunk's tile takes the rest: a foreground faster than 1 runs past the last chunk.
            right = plate.width if j == n - 1 else min(plate.width, (j + 1) * w)
            out = region / "layers" / f"{region.name}.{layer_id}.{j}.png"
            plate.crop((j * w, 0, right, plate.height)).save(out, optimize=True)
            written.append(out)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=["key", "masks", "fill", "complete", "near", "under", "clear", "collision",
                                         "region", "whole", "bleed"])
    parser.add_argument("region", type=Path)
    parser.add_argument("chunk", nargs="?", help="not for region")
    parser.add_argument("--only", nargs="+", choices=PARALLAX, default=list(PARALLAX), help="fill: these layers")
    parser.add_argument("--reuse", action="store_true", help="fill: cut the plates from the paintings in tmp/ again")
    parser.add_argument("--all", action="store_true", help="masks: every band, not only the parallax ones")
    args = parser.parse_args()
    region = args.region if args.region.is_absolute() else ROOT / args.region
    if args.step == "region":
        for path in region_layers(region):
            print(f"{region.name}: region plate -> {path.relative_to(ROOT)}")
        return
    art = art_for(region, args.chunk)
    raw = raw_dir(region) / f"{args.chunk}--depth.png"
    if args.step == "key":
        key = api(f"{args.chunk}--depth", art, key_prompt(region, args.chunk))
        if key is None:
            sys.exit(1)
        key.save(raw)
        print(f"{args.chunk}: depth key -> {raw.relative_to(ROOT)}")
    elif args.step == "masks":
        if not raw.exists():
            sys.exit(f"{raw.relative_to(ROOT)} missing: run the key step first")
        bands = refine(vote(snap(Image.open(raw)), art.size), art)
        which = tuple(n for n in BACK_TO_FRONT if n != "rear") if args.all else PARALLAX  # rear = the default rule
        if args.all and band_of(region, args.chunk) == "below":  # underground: no sky behind, nothing scrolls slower
            which = tuple(n for n in which if n not in PARALLAX)
        for path in write_masks(region, args.chunk, bands, art.size, which):
            print(f"{args.chunk}: mask -> {path.relative_to(ROOT)}")
    elif args.step == "collision":
        print(f"{args.chunk}: walk lines and no-go -> {collision(region, args.chunk, art).relative_to(ROOT)}")
    elif args.step == "complete":
        complete(region, args.chunk, art, tuple(n for n in args.only if n != "sky") or ("far", "mid"), args.reuse)
    elif args.step == "near":
        near(region, args.chunk, args.reuse)
    elif args.step == "clear":
        clear(region, args.chunk, args.reuse)
    elif args.step == "under":
        under(region, args.chunk, args.reuse)
    elif args.step == "whole":
        whole(region, args.chunk, art, args.reuse)
    elif args.step == "bleed":
        bleed(region, args.chunk)
    else:
        fill(region, args.chunk, art, tuple(args.only), args.reuse)


if __name__ == "__main__":
    main()
