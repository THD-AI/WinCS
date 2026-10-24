"""Grow a stage region one chunk at a time, from the edge of the chunk next to it (docs/04, docs/09).

    python scripts/grow_stage.py art/stages/<region> <from-chunk> <left|right> <new-chunk>
    python scripts/grow_stage.py feature art/stages/<region> <chunk> --box x0,y0,x1,y1 --brief "…"
    python scripts/grow_stage.py join art/stages/<region> <left-chunk> <right-chunk>   # both grown, both may change

Every call to the model is one 2160x720 canvas (3:1, the API's limit): known art on one side, the area to
paint on the other. A chunk grows in two pieces – first 1440 px next to 720 px of its neighbour, then the
last 720 px next to that first piece – so the model always continues a wide strip of finished art and the
new chunk lies right next to its neighbour with nothing repeated. The second piece also paints 128 px over
the first; a minimum-error path through that overlap joins them (image quilting). The neighbour is never
repainted. (A wider canvas padded with sky to reach
3:1 failed: the model reframed it and moved the whole picture 60–90 px.)

The image the model edits is the LAYOUT GUIDE: the board's "route" (walk lines, water, structures, ladders,
hollows, in chunk pixels) drawn flat where the new art goes, the known art beside it. The mask says where to
paint. Painting over the guide keeps the walkable surfaces where the route needs them.

The model keeps a grown chunk's path continuous but tends to smooth route features away, so features are a
second step: `feature` repaints one window (plus 64 px margins joined back by min-error cuts) over the guide,
with a short concrete brief – a gap with stepping stones, a fallen log, a hill.

After both pieces, the colours along the seam are matched to the neighbour (shapes untouched). Raw output
stays in tmp/boards/<region>/: <new-chunk>.png, its guides and the model's pieces. After review, copy it to
the region's images/ and add it to chunks.json, layers.json and export.json.
Needs OPENAI_API_KEY (environment or .env); the key goes in a header file (make_boards.edit).
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_boards as mb  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
W, H = 2160, 720
PIECES = (1440, 720)  # painted per call; the rest of the canvas is known art
OVERLAP = 128         # a later piece also paints this far over the earlier one; a min-error cut joins them

PROMPT = (
    "This image is part of a side-scrolling stage. The finished art along its {edge} side must stay exactly as it "
    "is. Paint the rest - where a flat LAYOUT GUIDE is drawn - as the part of the stage {where} that art, one "
    "continuous place: the ground line, the light, the palette, the fine 2-pixel grain and the scale continue "
    "without a break, and the walkable path meets the finished art at exactly the same height. Follow the guide "
    "exactly: red lines are the tops of the walkable surfaces - put the path, deck or step edge exactly there; "
    "brown is solid ground under them; blue is water (by the pond it reaches up under the path); grey boxes are "
    "built things (a gate, a bench, a shed); yellow is a ladder; purple is a hollow you can walk into; the pale "
    "blue above is open for sky and trees. Never draw the guide's flat colours or lines themselves. Strict side "
    "view, an architect's elevation: everything runs parallel to the screen, nothing recedes. The same depth "
    "layers as the finished art: sky, a hazy far tree line, mid trees, the play layer, water if any, a dark "
    "out-of-focus foreground along the bottom edge. No characters, no animals, no text.\n\n"
    "WHAT IS HERE: {brief}")

GUIDE = {"sky": (200, 220, 240), "ground": (120, 80, 50), "walk": (230, 30, 30), "water": (40, 90, 220),
         "structure": (140, 140, 140), "ladder": (240, 220, 40), "hollow": (150, 60, 170)}


def guide_for(route: dict, known: Image.Image, ox: int) -> Image.Image:
    """The canvas the model edits: the route drawn flat (chunk x + ox = canvas x), the known art pasted over it."""
    guide = Image.new("RGB", (W, H), GUIDE["sky"])
    draw = ImageDraw.Draw(guide)
    for line in route.get("walk", []):  # ground fills from each walk line down
        pts = [(ox + x, y) for x, y in line]
        draw.polygon(pts + [(pts[-1][0], H), (pts[0][0], H)], fill=GUIDE["ground"])
    if "below" in route:  # what lies under the walkable layer from this height on (a pond: water)
        y, kind = route["below"]
        draw.rectangle((0, y, W, H), fill=GUIDE[kind])
    for kind in ("water", "structure", "hollow", "ladder"):
        for x1, y1, x2, y2 in route.get(kind, []):
            draw.rectangle((ox + x1, y1, ox + x2, y2), fill=GUIDE[kind])
    for line in route.get("walk", []):
        draw.line([(ox + x, y) for x, y in line], fill=GUIDE["walk"], width=6)
    guide.paste(known.convert("RGB"), mask=known.getchannel("A"))
    return guide


def known_canvas(strip: Image.Image, left: bool, piece: int, overlap: int = 0) -> Image.Image:
    """W x H: the nearest W - piece px of `strip` beside `piece` px to paint; transparent = paint.

    With an overlap the transparent area reaches that far over the strip too (the strip's pixels stay
    underneath, so the model sees them, but it may repaint them)."""
    canvas = Image.new("RGBA", (W, H))
    keep = W - piece
    if left:  # paint on the left, the strip's left end on the right
        canvas.paste(strip.crop((0, 0, keep, H)), (piece, 0))
        if overlap:
            alpha = canvas.getchannel("A")
            alpha.paste(0, (piece, 0, piece + overlap, H))
            canvas.putalpha(alpha)
    else:
        canvas.paste(strip.crop((strip.width - keep, 0, strip.width, H)), (0, 0))
        if overlap:
            alpha = canvas.getchannel("A")
            alpha.paste(0, (keep - overlap, 0, keep, H))
            canvas.putalpha(alpha)
    return canvas


def min_cut(a: Image.Image, b: Image.Image) -> list[int]:
    """Per row, the column where the overlap switches from a to b: the vertical path of least colour difference.

    a and b are the same overlap strip painted twice; the path moves at most one column per row (image quilting)."""
    w, h = a.size
    diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L").load()
    cost = [[diff[x, 0] for x in range(w)]]
    for y in range(1, h):
        prev = cost[-1]
        cost.append([diff[x, y] + min(prev[max(0, x - 1):x + 2]) for x in range(w)])
    x = min(range(w), key=lambda i: cost[-1][i])
    path = [x]
    for y in range(h - 2, -1, -1):
        x = min(range(max(0, x - 1), min(w, x + 2)), key=lambda i: cost[y][i])
        path.append(x)
    return path[::-1]


def offset(left: bool, done: int, piece: int) -> int:
    """Canvas x minus chunk x for this piece. Growing left, the new chunk's right part is painted first."""
    return -(W - done - piece) if left else W - piece - done


def match_seam(new: Image.Image, neighbour: Image.Image, left: bool, ramp: int = 160, blur: int = 9) -> Image.Image:
    """Shift the new chunk's colours near the seam so its edge column meets the neighbour's, fading out over `ramp` px.

    Per row: the colour step across the seam, smoothed over ±blur rows; added in full at the seam and linearly
    less further in. Shapes are untouched – only the light and tint the model got slightly wrong."""
    edge_x, other_x = (W - 1, 0) if left else (0, W - 1)
    a, b = new.convert("RGB").load(), neighbour.convert("RGB").load()
    step = [[b[other_x, y][c] - a[edge_x, y][c] for c in range(3)] for y in range(H)]
    smooth = [[sum(step[j][c] for j in range(max(0, y - blur), min(H, y + blur + 1))) /
               (min(H, y + blur + 1) - max(0, y - blur)) for c in range(3)] for y in range(H)]
    out = new.convert("RGB").copy()
    px = out.load()
    for i in range(ramp):
        x = W - 1 - i if left else i
        k = 1 - i / ramp
        for y in range(H):
            r, g, bl = px[x, y]
            dr, dg, db = smooth[y]
            px[x, y] = (max(0, min(255, round(r + dr * k))), max(0, min(255, round(g + dg * k))),
                        max(0, min(255, round(bl + db * k))))
    return out


def column_step(a: Image.Image, ax: int, b: Image.Image, bx: int) -> float:
    """Mean colour jump between column ax of a and column bx of b."""
    diff = ImageChops.difference(a.crop((ax, 0, ax + 1, H)).convert("RGB"), b.crop((bx, 0, bx + 1, H)).convert("RGB"))
    return sum(sum(px) for px in diff.getdata()) / (3 * H)


def seam_step(new: Image.Image, neighbour: Image.Image, left: bool) -> float:
    """The jump across the seam between the new chunk and its neighbour."""
    return column_step(new, W - 1, neighbour, 0) if left else column_step(neighbour, W - 1, new, 0)


def own_step(neighbour: Image.Image, left: bool) -> float:
    """The jump between the neighbour's own two columns at the seam: what a seamless join looks like."""
    return column_step(neighbour, 0, neighbour, 1) if left else column_step(neighbour, W - 2, neighbour, W - 1)


FEATURE = (
    "This is one chunk of a side-scrolling stage. Change ONLY the transparent window: {brief} Everything outside "
    "the window stays exactly as it is, and the window's edges join it seamlessly - the same light, palette, fine "
    "2-pixel grain and scale. Under the window lies a flat LAYOUT GUIDE: red lines are the tops of walkable "
    "surfaces, blue is water, brown is solid ground, grey is a built thing, yellow a ladder, purple a hollow. "
    "Follow it exactly, but never draw its flat colours or lines. Strict side view, no characters, no text.")
MARGIN = 64  # the feature window also repaints this much on each side; min-error cuts join it back


def repaint(art: Image.Image, box: tuple[int, int, int, int], route: dict, prompt: str, refs_in: list[str],
            model: str, name: str, guide_out: Path) -> Image.Image:
    """Repaint one window of a W x H image over the layout guide, joined back on both sides by min-error cuts.

    The window is the box plus MARGIN px each side; inside the box the painting wins, in the margins the
    least visible path decides where the painting ends and the old art begins."""
    x0, y0, x1, y1 = box
    wx0, wx1 = max(0, x0 - MARGIN), min(W, x1 + MARGIN)
    known = art.copy()
    alpha = known.getchannel("A")
    alpha.paste(0, (wx0, y0, wx1, y1))
    known.putalpha(alpha)
    guide = guide_for(route, known, 0)
    guide.save(guide_out)
    with tempfile.TemporaryDirectory() as folder:
        base, mask = Path(folder) / "guide.png", Path(folder) / "mask.png"
        guide.save(base)
        known.save(mask)
        refs = [base, *(mb.load_ref(ref, Path(folder)) for ref in refs_in)]
        png = mb.edit(name, {"model": model, "prompt": prompt, "size": f"{W}x{H}"}, refs, mb.api_key(), mask=mask)
    if png is None:
        sys.exit(1)
    painted = Image.open(io.BytesIO(png)).convert("RGBA").resize((W, H))
    out = art.copy()
    o, s = out.load(), painted.load()
    left_cut = min_cut(painted.crop((wx0, y0, x0, y1)), art.crop((wx0, y0, x0, y1))) if x0 > wx0 else []
    right_cut = min_cut(art.crop((x1, y0, wx1, y1)), painted.crop((x1, y0, wx1, y1))) if wx1 > x1 else []
    for y in range(y0, y1):
        start = wx0 + (left_cut[y - y0] if left_cut else 0)
        end = x1 + (right_cut[y - y0] if right_cut else 0)
        for x in range(start, end):
            o[x, y] = s[x, y]
    return out


def feature(region: Path, chunk: str, box: tuple[int, int, int, int], brief: str) -> None:
    """Repaint one window of a grown chunk to put a route feature there (a gap, a log, a hill), following the route."""
    config = json.loads((region / "boards.json").read_text(encoding="utf-8"))
    board = next(b for b in config["boards"] if b["id"] == chunk)
    raw = ROOT / "tmp" / "boards" / region.name
    art = Image.open(raw / f"{chunk}.png").convert("RGBA")
    prompt = "\n\n".join([FEATURE.format(brief=brief), config["style"], config["people"]])
    out = repaint(art, box, board.get("route", {}), prompt, board["inputs"], config["model"], f"{chunk} feature",
                  raw / f"{chunk}--feature-guide.png")
    out.convert("RGB").save(raw / f"{chunk}.png")
    print(f"{chunk}: feature painted in {box} -> {(raw / (chunk + '.png')).relative_to(ROOT)}")


JOIN = ("This image shows two neighbouring chunks of a side-scrolling stage meeting in the middle. Repaint ONLY the "
        "transparent window across the join so the two sides become one continuous place: the sky, the trees, the "
        "path, the water and the foreground run through without a break, a cut or a dark column, in the same light, "
        "palette, fine 2-pixel grain and scale. Keep the walkable path at the height the guide's red line shows. "
        "Strict side view, no characters, no text.")


def join(region: Path, left_chunk: str, right_chunk: str, half: int = 160) -> None:
    """Repaint a window across the seam of two grown chunks (both raw, both may change) and split them again."""
    config = json.loads((region / "boards.json").read_text(encoding="utf-8"))
    board = next(b for b in config["boards"] if b["id"] == left_chunk)
    raw = ROOT / "tmp" / "boards" / region.name
    a, b = (Image.open(raw / f"{c}.png").convert("RGBA") for c in (left_chunk, right_chunk))
    strip = Image.new("RGBA", (W, H))
    strip.paste(a.crop((W // 2, 0, W, H)), (0, 0))
    strip.paste(b.crop((0, 0, W // 2, H)), (W // 2, 0))
    route = {"walk": [[[0, 441], [W, 441]]]} if "walk" in board.get("route", {}) else {}
    prompt = "\n\n".join([JOIN, config["style"], config["people"]])
    out = repaint(strip, (W // 2 - half, 0, W // 2 + half, H), route, prompt, board["inputs"], config["model"],
                  f"{left_chunk}|{right_chunk} join", raw / f"{left_chunk}--join-guide.png")
    a.paste(out.crop((0, 0, W // 2, H)), (W // 2, 0))
    b.paste(out.crop((W // 2, 0, W, H)), (0, 0))
    a.convert("RGB").save(raw / f"{left_chunk}.png")
    b.convert("RGB").save(raw / f"{right_chunk}.png")
    print(f"{left_chunk}|{right_chunk}: joined (seam step now {column_step(a, W - 1, b, 0):.1f})")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "join":
        parser = argparse.ArgumentParser(description="Repaint the seam between two grown chunks.")
        parser.add_argument("step")
        parser.add_argument("region", type=Path)
        parser.add_argument("left")
        parser.add_argument("right")
        args = parser.parse_args()
        region = args.region if args.region.is_absolute() else ROOT / args.region
        return join(region, args.left, args.right)
    if len(sys.argv) > 1 and sys.argv[1] == "feature":
        parser = argparse.ArgumentParser(description="Repaint one window of a grown chunk with a route feature.")
        parser.add_argument("step")
        parser.add_argument("region", type=Path)
        parser.add_argument("chunk")
        parser.add_argument("--box", required=True, help="x0,y0,x1,y1 in chunk pixels")
        parser.add_argument("--brief", required=True)
        args = parser.parse_args()
        region = args.region if args.region.is_absolute() else ROOT / args.region
        return feature(region, args.chunk, tuple(int(v) for v in args.box.split(",")), args.brief)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("region", type=Path)
    parser.add_argument("source")
    parser.add_argument("direction", choices=["left", "right"])
    parser.add_argument("new")
    args = parser.parse_args()
    region = args.region if args.region.is_absolute() else ROOT / args.region
    config = json.loads((region / "boards.json").read_text(encoding="utf-8"))
    board = next((b for b in config["boards"] if b["id"] == args.new), None)
    if board is None:
        sys.exit(f"{args.new}: add its board (id, brief, route, inputs) to {region.name}/boards.json first")
    raw = ROOT / "tmp" / "boards" / region.name
    raw.mkdir(parents=True, exist_ok=True)
    source = raw / f"{args.source}.png"
    if not source.exists():
        source = region / "images" / f"{args.source}.png"
    neighbour = Image.open(source).convert("RGBA")
    left = args.direction == "left"
    prompt = "\n\n".join([PROMPT.format(edge="right" if left else "left",
                                        where="to the left of" if left else "to the right of", brief=board["prompt"]),
                          config["style"], config["people"]])
    strip, done = neighbour, 0  # the known art, growing piece by piece; px of the new chunk painted so far
    for n, piece in enumerate(PIECES, 1):
        overlap = OVERLAP if n > 1 else 0  # the first piece meets the neighbour, which stays exact
        known = known_canvas(strip, left, piece, overlap)  # the mask: the overlap is open for painting
        guide = guide_for(board.get("route", {}), known_canvas(strip, left, piece), offset(left, done, piece))
        guide.save(raw / f"{args.new}--guide-{n}.png")
        with tempfile.TemporaryDirectory() as folder:
            base, mask = Path(folder) / "guide.png", Path(folder) / "mask.png"
            guide.save(base)
            known.save(mask)  # transparent = paint here
            refs = [base, *(mb.load_ref(ref, Path(folder)) for ref in board["inputs"])]
            png = mb.edit(f"{args.new} piece {n}", {"model": config["model"], "prompt": prompt, "size": f"{W}x{H}"},
                          refs, mb.api_key(), mask=mask)
        if png is None:
            sys.exit(1)
        painted = Image.open(io.BytesIO(png)).convert("RGBA").resize((W, H))
        painted.save(raw / f"{args.new}--piece-{n}.png")
        part = painted.crop((0, 0, piece, H)) if left else painted.crop((W - piece, 0, W, H))
        grown = Image.new("RGBA", (strip.width + piece, H))
        grown.paste(part, (0, 0) if left else (strip.width, 0))
        grown.paste(strip, (piece, 0) if left else (0, 0))
        if overlap:  # join the new piece to the earlier one along the least visible path through the overlap
            ox = piece if left else strip.width - overlap  # the overlap in `grown`
            px0 = piece if left else W - piece - overlap   # the same columns in `painted`
            new_side = painted.crop((px0, 0, px0 + overlap, H))
            old_side = grown.crop((ox, 0, ox + overlap, H))
            cut = min_cut(new_side, old_side)
            g, s = grown.load(), new_side.load()
            for y, c in enumerate(cut):
                for x in (range(c) if left else range(c, overlap)):
                    g[ox + x, y] = s[x, y]
        strip, done = grown, done + piece
    new = (strip.crop((0, 0, W, H)) if left else strip.crop((strip.width - W, 0, strip.width, H))).convert("RGB")
    before = seam_step(new, neighbour, left)
    new = match_seam(new, neighbour, left)
    new.save(raw / f"{args.new}.png")
    strip.paste(new, (0, 0) if left else (strip.width - W, 0))
    strip.convert("RGB").save(raw / f"{args.new}--with-neighbour.png")
    print(f"{args.new}: grown {args.direction} of {args.source} -> {(raw / (args.new + '.png')).relative_to(ROOT)} "
          f"(seam step {before:.1f} -> {seam_step(new, neighbour, left):.1f}; "
          f"the neighbour's own column step is {own_step(neighbour, left):.1f})")


if __name__ == "__main__":
    main()
