"""Grow neighbours from a shared edge band: python scripts/zones/creek_grow.py <src> <dir>:<out> [<dir>:<out> ...]
Same idea as make_boards.py `neighbour` (band = 1/3, transparent rest = mask), plus a stacked-zone brief per
direction and a 64 px ramp on the band's inner edge so the seam blends instead of cutting."""
import sys, io, json, tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
sys.path.insert(0, str(ROOT / "scripts"))
import make_boards as mb
RAMP = 64
COMMON = ("This image is one part of a stacked cross-section concept of a 2D side-scrolling exploration game zone "
 "(Rusty Creek, a university campus overlapped by a broken quantum experiment). The strip along its {edge} edge is "
 "existing art from the neighbouring part: keep it exactly. Paint the transparent rest as the part {where} it: every "
 "girder, wall, floor, ceiling, water line and the soil continue across the seam at the same heights, with the same "
 "light, palette, fine 2-pixel hi-bit pixel-art grain and scale (a person would be only 27 px tall: rooms at least "
 "160 px tall, passages at least 135 px, big quiet spaces). Strict side view, architect's cutaway. Only built "
 "underground - concrete, tiles, pipes, steel - no natural caves, no stalactites, no rock formations. Soft rounded "
 "ground outside, never blocky steps. Secret horror: calm and pretty first, wrong on a second look. No people, no "
 "animals, no text, no letters, no UI.\n\nTHIS PART: {brief}")
BRIEF = {
 "left": ("the creek path, the rusty pipe railing and the creek continue left; the railway bridge ends on a big stone "
   "abutment set into a soft grassy railway embankment that rises in a long smooth curve to the left edge with autumn "
   "trees; rusty blue-green girders with ladders climb up the embankment and through the trees to a high lookout "
   "girder; under the water line the concrete storm drain continues left and ends in a tall culvert intake chamber "
   "with a big grated inlet and a ladder shaft going down."),
 "right": ("the railway bridge and the creek path continue right; past the second pier a wide OPEN GIRDER FLOOR spreads "
   "over the creek - a big flat rusty deck with nothing on it, the clearing where a boss fight happens - with a "
   "signal gantry and ladder at its far end and autumn trees; under the water line the service tunnel continues right "
   "into a tall PUMP ROOM with two big teal pumps, vertical pipes and a steel grating catwalk, girders grown through it."),
 "right2": ("the railway bridge continues right; the rust maze's rusty blue-green girders continue from the seam and "
   "end in a wide OPEN GIRDER FLOOR: one long flat riveted girder deck spanning from the second bridge pier to the right "
   "edge, a little above the creek path, about 1000 px wide and completely empty, framed by two tall girder towers with "
   "ladders - an arena for a boss fight; autumn trees and a soft grassy bank rising behind it; one more clean black 404 "
   "rectangle torn in the sky; under the water line the service tunnel continues right into a tall PUMP ROOM (at least "
   "250 px tall) with two big teal pumps, vertical pipes and a steel catwalk, girders grown through its walls."),
 "down": ("deeper underground below the built rooms: the creek's WRONG REFLECTION. A huge tall flooded concrete hall "
   "(at least 450 px tall) whose ceiling is the underside of the rooms above; from that ceiling the rusty blue-green "
   "girder maze with its ladders hangs UPSIDE DOWN, a mirror image of the maze above the creek, its tips dipping into "
   "a still black water floor that mirrors it again; cold blue-green light, a few warm caged lamps upside down; the "
   "ladder shafts and the drain pipe from above continue down into the hall; concrete columns, a steel catwalk along "
   "one wall. Beautiful and quiet, and wrong."),
 "down2": ("the deepest level, under the flooded hall: the quantum experiment's own spaces - a long cable vault and a "
   "server room of the campus experiment, knee-deep in still water, rows of server racks with tiny blue status lights, "
   "thick bundled cables hanging from the ceiling in soft curves like roots, cable trays and a steel catwalk; the "
   "upside-down girders from above pierce the ceiling and continue down; in the middle of the floor one clean black "
   "rectangular '404' hole cut into the picture, with a few stretched pixel rows at its edges. The deepest, quietest "
   "place; everything hums."),
}
EDGES = {"right": ("left", "to the right of"), "right2": ("left", "to the right of"), "left": ("right", "to the left of"), "down": ("top", "below"), "down2": ("top", "below")}

def grow(src, d, out):
    chunk = Image.open(HERE / src).convert("RGB"); w, h = chunk.size
    vert = d.startswith("down")
    band = (h if vert else w) // 3
    crop = {"right": (w - band, 0, w, h), "right2": (w - band, 0, w, h), "left": (0, 0, band, h)}.get(d, (0, h - band, w, h))
    at = {"right": (0, 0), "right2": (0, 0), "left": (w - band, 0)}.get(d, (0, 0))
    ctx = chunk.crop(crop)
    canvas = Image.new("RGBA", (w, h)); canvas.paste(ctx, at)
    edge, where = EDGES[d]
    prompt = COMMON.format(edge=edge, where=where, brief=BRIEF[d])
    with tempfile.TemporaryDirectory() as f:
        p = Path(f) / "ctx.png"; canvas.save(p)
        png = mb.edit(out, {"model": "gpt-image-2.5-sunburst", "prompt": prompt, "size": f"{w}x{h}"}, [p], mb.api_key(), mask=p)
    if not png: return f"{out}: failed"
    new = Image.open(io.BytesIO(png)).convert("RGB").resize((w, h))
    new.save(HERE / f"{out}-raw.png")
    # band mask: 255 over the band, ramping to 0 over its last RAMP px toward the new area
    m = Image.new("L", (w, h)); dr = ImageDraw.Draw(m)
    x0, y0 = at; bw, bh = ctx.size
    for i in range(RAMP + 1):
        v = int(255 * i / RAMP)
        if d.startswith("right"): dr.rectangle((0, 0, bw - 1 - RAMP + i, h), fill=v)
        if d == "left": dr.rectangle((w - bw + RAMP - i, 0, w, h), fill=v)
        if vert: dr.rectangle((0, 0, w, bh - 1 - RAMP + i), fill=v)
    full = Image.new("RGB", (w, h)); full.paste(ctx, at)
    new.paste(full, mask=m)
    new.save(HERE / f"{out}.png")
    (HERE / "prompts").mkdir(exist_ok=True)
    (HERE / "prompts" / f"{out}.json").write_text(json.dumps({"from": src, "dir": d, "band": band, "ramp": RAMP, "prompt": prompt}, indent=1))
    return f"{out}: ok"

if __name__ == "__main__":
    src = sys.argv[1]
    jobs = [a.split(":") for a in sys.argv[2:]]
    with ThreadPoolExecutor(4) as p:
        print(list(p.map(lambda j: grow(src, j[0], j[1]), jobs)))
