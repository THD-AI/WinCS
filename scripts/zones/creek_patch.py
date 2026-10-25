"""Masked patch: python scripts/zones/creek_patch.py <src.png> <out> "x0,y0,x1,y1;..." <prompt-key> [feather]
Repaints only the boxes; pasted back through the boxes (feathered), the rest stays pixel-exact."""
import sys, io, json, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
sys.path.insert(0, str(ROOT / "scripts"))
import make_boards as mb
PROMPTS = {
 "maze": ("This is a finished concept painting of a 2D side-scrolling game zone in hi-bit pixel art: a tall flooded "
   "concrete hall deep under a creek. Keep every pixel outside the transparent area exactly. In the transparent area "
   "paint the hall's WRONG REFLECTION: the rusty blue-green riveted girder maze from the surface, with its steel "
   "ladders, hangs UPSIDE DOWN from the concrete ceiling into the hall - square girder frames, steps and ladders "
   "pointing downward like a mirror image, the lowest girders dipping into the still black water floor; keep the "
   "concrete columns, pipes and the warm caged lamps; cold blue-green light, haze. Big quiet open space between the "
   "girders (a person would be only 27 px tall). Same pixel grain and palette. No people, no text, no UI."),
 "404": ("This is a finished concept painting of a 2D side-scrolling game zone in hi-bit pixel art. Keep every pixel "
   "outside the transparent rectangles exactly. In each transparent rectangle the sky is TORN by a '404 hole' of the "
   "anomaly: a clean, hard-edged rectangular cut in the picture showing flat pure black void, its edges broken into "
   "a few stair-stepped pixel blocks, with a few rows of the surrounding sky STRETCHED sideways into long streaks of "
   "colour along the cut's top and bottom edge, and one thin offset slice of the picture shifted a few pixels. Quiet "
   "and wrong, not explosive: no fire, no lightning, no glow, no letters, no numbers, no text, no UI."),
}
src, out, boxes, key, *rest = sys.argv[1:]
feather = float(rest[0]) if rest else 0
base = Image.open(HERE / src).convert("RGB"); W, H = base.size
boxes = [tuple(int(v) for v in b.split(",")) for b in boxes.split(";")]
with tempfile.TemporaryDirectory() as f:
    f = Path(f); bp, mp = f / "b.png", f / "m.png"
    base.save(bp)
    m = Image.new("RGBA", (W, H), (0, 0, 0, 255)); d = ImageDraw.Draw(m)
    for b in boxes: d.rectangle(b, fill=(0, 0, 0, 0))
    m.save(mp)
    png = mb.edit(out, {"model": "gpt-image-2.5-sunburst", "prompt": PROMPTS[key], "size": f"{W}x{H}"}, [bp], mb.api_key(), mask=mp)
if not png: sys.exit("failed")
new = Image.open(io.BytesIO(png)).convert("RGB").resize((W, H))
keep = Image.new("L", (W, H)); d = ImageDraw.Draw(keep)
for b in boxes: d.rectangle(b, fill=255)
if feather: keep = keep.filter(ImageFilter.GaussianBlur(feather))
base.paste(new, mask=keep); base.save(HERE / f"{out}.png")
(HERE / "prompts").mkdir(exist_ok=True)
(HERE / "prompts" / f"{out}.json").write_text(json.dumps({"base": src, "boxes": boxes, "prompt": PROMPTS[key]}, indent=1))
print(out, "ok")
