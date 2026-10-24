"""Crush the reviewed takes into art/locations/rusty-creek-stacked/ (make_boards conventions: factor 2, 96 colours) + chunk grid."""
import sys, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
sys.path.insert(0, str(ROOT / "scripts"))
import make_boards as mb
mb.RAW = HERE / "publish"; mb.OUT = ROOT / "art" / "locations" / "rusty-creek-stacked"  # not images/: check_docs ties that folder to locations.json
mb.RAW.mkdir(exist_ok=True)
PICK = {"clean": "clean-4", "anomaly": "anomaly-3b", "left": "an-left", "right": "an-right2", "down": "an-down-b",
        "down2": "an-down2", "zone": "zone-anomaly"}
for part, src in PICK.items():
    pid = part
    Image.open(HERE / f"{src}.png").convert("RGB").save(mb.RAW / f"{pid}.png")
    mb.crush({"id": pid, "factor": 2, "keyed": False})
    if part not in ("clean", "anomaly"):   # previews only for the two centre concepts (size)
        (mb.OUT / f"{pid}-preview.png").unlink()
# chunk grid: the concept read at hero = 27 px (1/3 of game scale), so a 2160x720 game chunk is 720x240 here
zone = Image.open(mb.OUT / "zone.png").convert("RGB")
zone = zone.resize((zone.width // 2, zone.height // 2), Image.Resampling.BOX)   # quarter size: chunk = 180x60
d = ImageDraw.Draw(zone, "RGBA")
try: font = ImageFont.truetype("arialbd.ttf", 12)
except OSError: font = ImageFont.load_default()
CW, CH = 180, 60
ROLE = {}  # (col,row): colour
for c in range(7):
    for r in range(4): ROLE[(c, r)] = (255, 210, 80) if r < 2 else ((90, 200, 255) if r == 2 else (255, 140, 60))
for c in (2, 3, 4):
    for r in range(4, 11): ROLE[(c, r)] = (120, 255, 200) if r < 8 else (190, 120, 255)
for (c, r), col in ROLE.items():
    box = (c * CW, r * CH, c * CW + CW - 1, r * CH + CH - 1)
    d.rectangle(box, outline=col + (255,), width=2)
    d.text((box[0] + 4, box[1] + 2), f"cz-{c}-{r}", fill=col + (255,), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
zone.quantize(128, dither=Image.Dither.NONE).save(mb.OUT / "grid.png", optimize=True)
print("grid", zone.size)
