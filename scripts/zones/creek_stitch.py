"""Stitch the anomaly zone: center + left + right + down + down2, each grown from a 1/3 edge band."""
from pathlib import Path
from PIL import Image
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
W, H = 2176, 1088
DX, DY = W - W // 3, H - H // 3          # 1451, 726: offset between neighbours (they share a band)
PARTS = [("anomaly-3b", 1, 0), ("an-left", 0, 0), ("an-right2", 2, 0), ("an-down-b", 1, 1), ("an-down2", 1, 2)]
canvas = Image.new("RGB", (2 * DX + W, 2 * DY + H), (22, 20, 20))
for name, gx, gy in PARTS:          # later parts lie on top: their band ramps blend into what is below
    canvas.paste(Image.open(HERE / f"{name}.png").convert("RGB"), (gx * DX, gy * DY))
canvas.save(HERE / "zone-anomaly.png")
print(canvas.size)
