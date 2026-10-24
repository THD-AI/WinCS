"""Parallax layers for a painted stage chunk: a depth key from the model, masks from the key, fills behind.

    python scripts/depth_layers.py key   art/stages/<region> <chunk>   # API: repaint the chunk as flat depth colours
    python scripts/depth_layers.py masks art/stages/<region> <chunk>   # key -> one mask per layer (committed)
        [--all]                                                        # every band (grown chunks), not only parallax
    python scripts/depth_layers.py collision art/stages/<region> <chunk>  # walk lines + water no-go from the key
    python scripts/depth_layers.py region art/stages/<region>          # quilt the chunks' slow layers into one plate each
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
        out = raw_dir(region) / "filled" / f"{chunk}.{DEPTH[name][0]}.filled.png"  # an intermediate: not committed
        out.parent.mkdir(exist_ok=True)
        plate.save(out, optimize=True)
        print(f"{chunk}: {name} filled -> {out.relative_to(ROOT)}", flush=True)


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
    data["walk"] = walk_lines(bands, w, h) + board.get("walkExtra", [])
    water = [y for y in range(h) for x in range(0, w, 8) if bands[y * w + x] == "water"]
    data["noGo"] = [{"x": 0, "y": min(water), "w": w, "h": h - min(water)}] if water else []
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
    chunks = sorted(export["chunks"].items(), key=lambda kv: kv[1]["x"])
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
    parser.add_argument("step", choices=["key", "masks", "fill", "collision", "region"])
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
        key = api(f"{args.chunk}--depth", art, KEY_PROMPT)
        if key is None:
            sys.exit(1)
        key.save(raw)
        print(f"{args.chunk}: depth key -> {raw.relative_to(ROOT)}")
    elif args.step == "masks":
        if not raw.exists():
            sys.exit(f"{raw.relative_to(ROOT)} missing: run the key step first")
        bands = refine(vote(snap(Image.open(raw)), art.size), art)
        which = tuple(n for n in BACK_TO_FRONT if n != "rear") if args.all else PARALLAX  # rear = the default rule
        for path in write_masks(region, args.chunk, bands, art.size, which):
            print(f"{args.chunk}: mask -> {path.relative_to(ROOT)}")
    elif args.step == "collision":
        print(f"{args.chunk}: walk lines and no-go -> {collision(region, args.chunk, art).relative_to(ROOT)}")
    else:
        fill(region, args.chunk, art, tuple(args.only), args.reuse)


if __name__ == "__main__":
    main()
