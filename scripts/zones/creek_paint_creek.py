"""Paint Rusty Creek stacked concepts. Usage: python scripts/zones/creek_paint_creek.py <take> [<take> ...]  (takes defined in TAKES)."""
import sys, tempfile, json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
sys.path.insert(0, str(ROOT / "scripts"))
import make_boards as mb

LOOK = ("LOOK: detailed hi-bit pixel art, fine 2-pixel grain, warm autumn palette, low golden light, soft haze between "
        "layers, like the game's style master. TONE: secret horror - calm and pretty first, wrong on a second look. "
        "No people, no animals, no characters, no text, no letters, no signs with writing, no UI.")
SCALE = ("SCALE: this is an overview of a big zone: a person would be only about 27 px tall here, so every room is at "
         "least 160 px tall and every passage at least 135 px tall - big, quiet, airy spaces, never cramped. Ground and "
         "banks flow in soft rounded Planet-of-Lana curves, never blocky steps or tiles; only built things (bridges, "
         "walls, tunnels, rooms) are straight. Strict side view, a cutaway cross-section of the land like an "
         "architect's elevation: what is above the water, the water surface, and what is under it.")
LAYOUT = ("ZONE: Rusty Creek on a university campus in Bavaria, as one stacked cross-section, top to bottom. "
          "ABOVE: a long rusty blue-green riveted plate-girder RAILWAY BRIDGE crosses high over the whole image on two "
          "tall concrete piers with ivy; a lower steel truss footbridge hangs under it between the piers; ladders "
          "climb from the creek path to the footbridge and from the footbridge to the rail bridge's maintenance walk; "
          "a signal gantry with a ladder on the right; soft grassy railway embankments rise left and right; autumn "
          "trees (yellow, orange, red) behind. WATER LEVEL: a cement CREEK PATH with a grey pipe railing runs along the "
          "water under the bridge; the calm creek surface reflects the trees. BELOW the water line the cutaway shows "
          "the BUILT underground of the campus - no natural caves, no rock formations, no stalactites: "
          "on the left a big round concrete CULVERT mouth opens at water level and drops through a shaft into a long "
          "arched STORM DRAIN tunnel with a shallow channel of water in its floor; in the middle a tall PUMP ROOM with "
          "two big teal pumps, vertical pipes and a steel catwalk; then a long SERVICE TUNNEL with cable trays along "
          "the ceiling; on the right a FLOODED BASEMENT, its lower half filled with still black water. Warm caged "
          "wall lamps light every built room; between the rooms is dark packed earth and concrete.")
CLEAN = ("STATE: clean - the real place, calm, early morning, everything intact and maintained; only a faint wrongness: "
         "the still water in the flooded basement reflects a rusty girder that is not there.")
ANOMALY = ("STATE: anomaly - the SAME place, same camera, same layout, after the crash. Rusty blue-green riveted "
           "girders with ladders have grown through everything: a girder maze rises above the railway bridge and "
           "through the trees, girders pierce the culvert, the storm drain and the pump room. The flooded basement and "
           "the water under the creek become the RUST MAZE upside down: the creek's WRONG REFLECTION, a drowned "
           "girder maze lit cold blue-green. Two or three '404' holes torn in the sky: clean rectangular cuts showing "
           "flat black void with a few stretched pixel rows at their edges (no letters). Still calm and pretty at "
           "first glance, wrong on the second.")

S = "repo:art/direction/images/style-master-preview.png"
ZA = "repo:tmp/zones/concepts/zone-a.png"
BC = "repo:art/stages/rusty-creek/images/before-center.png"
AC = "repo:art/stages/rusty-creek/images/after-center.png"
TAKES = {
  # clean: layout from my painted guide (edited image), look from refs
  "clean-1": ("guide-a.png", [S, ZA], "The first image is a rough flat LAYOUT GUIDE: keep every shape where it is "
              "and paint it fully. The second image is the game's style master and the third a stacked zone concept: "
              "take their look only (palette, light, materials, grain), never their layout.", CLEAN),
  "clean-2": ("guide-b.png", [S, ZA], "The first image is a LAYOUT GUIDE (top half already painted, bottom half rough "
              "flat shapes): keep every shape where it is, repaint it all at the overview scale. The second image is "
              "the game's style master and the third a stacked zone concept: their look only, never their layout.", CLEAN),
  "clean-3": ("guide-a.png", [BC, ZA], "The first image is a rough flat LAYOUT GUIDE: keep every shape where it is "
              "and paint it fully. The second image is the real Rusty Creek bridge as painted for the game (materials "
              "of the bridge, piers, railing, trees, water) and the third a stacked zone concept (its look and its "
              "lit cutaway rooms) - never copy their layout.", CLEAN),
}

def add_anomaly(src, refs, n):
    TAKES[f"anomaly-{n}"] = (src, refs, "The first image is the CLEAN version of this zone: keep its layout, camera, "
        "bridge, piers, path, creek and every underground room exactly where they are, repaint it as the anomaly. "
        "The other images show the anomaly's look: the rust-maze girders (shape, colour, ladders) - never their layout.",
        ANOMALY)

ANOMALY4 = ANOMALY + (" UNDERGROUND in the anomaly: keep the built rooms (culvert shaft with ladder, arched storm drain, "
  "service tunnel, round outfall) but tall and open - the creek bed is the ceiling of ONE TALL FLOODED HALL in the middle, "
  "at least 250 px tall, where the girder maze of the surface hangs UPSIDE DOWN from the ceiling into still water, a "
  "mirror image of the maze above lit cold blue-green; girders and ladders grow through the concrete rooms on both sides. "
  "The 404 holes are mandatory: two clean black rectangles cut into the open sky between the bridge piers.")
TAKES["anomaly-4"] = ("clean-4.png", [AC], "The first image is the CLEAN version of this zone: keep its layout, camera, "
  "the railway bridge, both piers, the creek path, the creek and the underground's culvert shaft and storm drain where "
  "they are, and repaint it as the anomaly. The second image shows the anomaly's look: the rust-maze girders (shape, "
  "colour, ladders) - never its layout.", ANOMALY4)

def run(take):
    src, refs, lead, state = TAKES[take]
    prompt = "\n\n".join([lead, LAYOUT, state, SCALE, LOOK])
    with tempfile.TemporaryDirectory() as f:
        f = Path(f); base = f / "base.png"; mask = f / "mask.png"
        Image.open(HERE / src).convert("RGB").resize((2176, 1088)).save(base)
        Image.new("RGBA", (2176, 1088)).save(mask)
        imgs = [base] + [mb.load_ref(r, f) for r in refs]
        png = mb.edit(take, {"model": "gpt-image-2.5-sunburst", "prompt": prompt, "size": "2176x1088"}, imgs, mb.api_key(), mask=mask)
    (HERE / "prompts").mkdir(exist_ok=True)
    (HERE / "prompts" / f"{take}.json").write_text(json.dumps({"edited": src, "refs": refs, "prompt": prompt}, indent=1))
    if png: (HERE / f"{take}.png").write_bytes(png); return f"{take}: ok"
    return f"{take}: failed"

if __name__ == "__main__":
    takes = []
    for a in sys.argv[1:]:
        if a.startswith("anomaly-") and "," in a:
            parts = a.split(",")
            add_anomaly(parts[1], parts[2:], parts[0].split("-", 1)[1]); takes.append(parts[0])
        else:
            takes.append(a)
    with ThreadPoolExecutor(4) as p:
        print(list(p.map(run, takes)), flush=True)
