"""Check transparent art over the debug backdrops: purple, then white (docs/09, "every layer is whole, checked on purple").

    python scripts/backdrop_check.py <png> [...] [--out tmp/backdrop] [--holes]

For every RGBA image: a sheet with the image over the game's debug purple (#9b30ff) and over white, side by side,
in --out, and a line of findings:
- key: pixels left of the magenta key (#ff00ff and its near shades) – they show as pink specks on any backdrop;
- soft: semi-transparent pixels (alpha 1–254) – a hard-edged pixel sprite has none; a glow or a blend edge does;
- holes (--holes, for plates): fully transparent pixels enclosed by opaque ones in the same row and column –
  the cut-outs that show as soon as a layer moves.
Exit 1 when any image has key pixels (or holes, with --holes); soft pixels are reported, not failed.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PURPLE = (0x9B, 0x30, 0xFF)
WHITE = (255, 255, 255)


def findings(image: Image.Image, holes: bool = False) -> dict[str, int]:
    rgba = np.asarray(image.convert("RGBA")).astype(int)
    r, g, b, a = (rgba[..., i] for i in range(4))
    out = {
        "key": int(((a > 0) & (r > 200) & (b > 200) & (g < 90)).sum()),
        "soft": int(((a > 0) & (a < 255)).sum()),
    }
    if holes:
        solid = a > 0
        # enclosed: opaque somewhere left and right in its row, and above and below in its column
        left = np.maximum.accumulate(solid, axis=1)
        right = np.maximum.accumulate(solid[:, ::-1], axis=1)[:, ::-1]
        up = np.maximum.accumulate(solid, axis=0)
        down = np.maximum.accumulate(solid[::-1], axis=0)[::-1]
        out["holes"] = int((~solid & left & right & up & down).sum())
    return out


def sheet(image: Image.Image, scale: int = 1) -> Image.Image:
    rgba = image.convert("RGBA")
    w, h = rgba.size
    out = Image.new("RGB", (w * 2 + 8, h), (40, 40, 40))
    for i, colour in enumerate((PURPLE, WHITE)):
        bg = Image.new("RGBA", (w, h), colour + (255,))
        bg.alpha_composite(rgba)
        out.paste(bg.convert("RGB"), (i * (w + 8), 0))
    return out.resize((out.width * scale, out.height * scale), Image.Resampling.NEAREST) if scale > 1 else out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, default=Path("tmp/backdrop"))
    parser.add_argument("--holes", action="store_true", help="also count enclosed transparent pixels (plates)")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    failed = False
    for path in args.images:
        image = Image.open(path)
        found = findings(image, args.holes)
        scale = 4 if max(image.size) <= 200 else 2 if max(image.size) <= 600 else 1
        sheet(image, scale).save(args.out / f"{path.stem}.png")
        bad = found["key"] or found.get("holes", 0)
        failed |= bool(bad)
        print(f"{'FAIL' if bad else 'ok  '} {path}: " + ", ".join(f"{k} {v}" for k, v in found.items()))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
