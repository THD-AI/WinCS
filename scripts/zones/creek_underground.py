"""Repaint only the underground of a take (masked edit): python scripts/zones/creek_underground.py <src-take> <out> <guide|none> [refs...]

Base = the take; below CUT the guide's rough built rooms are pasted in (or the take is kept); the mask is
transparent below CUT. The result is pasted back through a feathered mask so the top stays pixel-exact.
"""
import sys, tempfile, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
sys.path.insert(0, str(ROOT / "scripts"))
import make_boards as mb
src, out, guide, *refs = sys.argv[1:]
CUT = int(dict(a.split("=") for a in []).get("cut", 0) or 0) or 730
W, H = 2176, 1088
PROMPT = ("This is a stacked cross-section concept of one zone of a 2D side-scrolling exploration game. The top "
 "(sky, railway bridge, trees, creek path and the creek's water surface) is final: keep it exactly. Paint ONLY the "
 "transparent bottom part: the cutaway of what lies under the creek - the BUILT underground of a university campus. "
 "No natural caves, no rock formations, no stalactites, no mine timbers, no wooden jetties. Left to right: a long "
 "arched concrete STORM DRAIN tunnel with a shallow channel of water along its floor, fed from above by a round "
 "concrete culvert shaft; a tall PUMP ROOM with two big teal pumps, vertical pipes, valves and a steel grating "
 "catwalk with a steel ladder; a long SERVICE TUNNEL with cable trays and conduit along the ceiling and a tiled "
 "wall; on the right a FLOODED BASEMENT, a plain concrete cellar whose lower half is still black water - and in that "
 "still water a rusty girder is reflected that is not there (the only wrong thing). Thick concrete slabs and packed "
 "dark earth between the rooms, a thick concrete ceiling under the creek bed. Warm caged bulkhead lamps, calm and "
 "quiet. SCALE: a person would be only 27 px tall here, so every room is at least 160 px tall: big quiet spaces, "
 "never cramped. Strict side view, architect's elevation. LOOK: the same detailed hi-bit pixel art, fine 2-pixel "
 "grain and palette as the top. No people, no animals, no text, no letters, no UI.")
base = Image.open(HERE / f"{src}.png").convert("RGB").resize((W, H))
if guide != "none":
    g = Image.open(HERE / guide).convert("RGB").resize((W, H))
    base.paste(g.crop((0, CUT, W, H)), (0, CUT))
with tempfile.TemporaryDirectory() as f:
    f = Path(f); bp = f / "base.png"; mp = f / "mask.png"
    base.save(bp)
    m = Image.new("RGBA", (W, H), (0, 0, 0, 255)); ImageDraw.Draw(m).rectangle((0, CUT, W, H), fill=(0, 0, 0, 0)); m.save(mp)
    imgs = [bp] + [mb.load_ref(r, f) for r in refs]
    png = mb.edit(out, {"model": "gpt-image-2.5-sunburst", "prompt": PROMPT, "size": f"{W}x{H}"}, imgs, mb.api_key(), mask=mp)
if not png: sys.exit("failed")
import io
new = Image.open(io.BytesIO(png)).convert("RGB").resize((W, H))
keep = Image.new("L", (W, H), 0); ImageDraw.Draw(keep).rectangle((0, CUT, W, H), fill=255)
final = Image.open(HERE / f"{src}.png").convert("RGB").resize((W, H))
final.paste(new, mask=keep.filter(ImageFilter.GaussianBlur(8)))
final.save(HERE / f"{out}.png"); new.save(HERE / f"{out}-raw.png")
(HERE / "prompts").mkdir(exist_ok=True)
(HERE / "prompts" / f"{out}.json").write_text(json.dumps({"base": src, "guide": guide, "cut": CUT, "refs": refs, "prompt": PROMPT}, indent=1))
print(out, "ok")
