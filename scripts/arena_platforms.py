"""Jenny's arena platforms (playtest J6): two girder platforms hung on chains from the girder over her arena.

    python scripts/arena_platforms.py            # writes art/stages/rusty-creek/arena/right.png and the one-way lines

The art is two sprite boards in the game's look (art/sprites boards.json): `arena-platform`, a short box girder in
the maze's own material, and `arena-chain`, a rusted chain. Exported at game size (export_atlas.py, into tmp/), they
are composed into one overlay plate for the right chunk's anomaly state (export.json `05-arena`, "overlay"):
each platform at PLATFORMS, and a chain from each end of it straight up to the underside of the girder above,
measured from the traversal plate – so nothing floats. The same numbers write the platforms' one-way lines into
rc-2-0.anomaly.collision.json (any earlier lines over the arena floor are replaced).

Heights (arena.test.ts checks them): the tops 84–89 px over the walk line – a full jump is 96 px – and the bottoms
clear Jenny's 56 px body, so she drives under them.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGION = ROOT / "art" / "stages" / "rusty-creek"
ATLAS = ROOT / "tmp" / "arena-atlas"
PLATFORMS = [(1180, 476), (1430, 476)]   # left edge, top (chunk px); 202 px wide
CHAIN_INSET = 18                        # chain centre from each platform end (px)
ARENA = (1126, 1700)                    # the arena floor's x range: one-way lines in it are the platforms'


def frame(board: str, name: str) -> Image.Image:
    sheet = Image.open(ATLAS / f"{board}.png").convert("RGBA")
    f = json.loads((ATLAS / f"{board}.json").read_text(encoding="utf-8"))["frames"][name]["frame"]
    cell = sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    return cell.crop(cell.getbbox())


def period(chain: Image.Image) -> int:
    """The chain's repeat (two links), from the autocorrelation of its rows' opacity."""
    rows = (np.asarray(chain.getchannel("A")) > 0).sum(1).astype(float)
    rows -= rows.mean()
    scores = {p: float((rows[:-p] * rows[p:]).mean()) for p in range(6, len(rows) // 2)}
    return max(scores, key=scores.get)


def chain_strip(chain: Image.Image, length: int) -> Image.Image:
    """A straight chain `length` px long: whole periods of the drawn chain, from its middle, stacked."""
    p = period(chain)
    top = (chain.height // 2) // p * p
    unit = chain.crop((0, top, chain.width, top + p))
    strip = Image.new("RGBA", (chain.width, length), (0, 0, 0, 0))
    for y in range(0, length, p):
        strip.alpha_composite(unit, (0, y)) if y + p <= length else strip.alpha_composite(unit.crop((0, 0, chain.width, length - y)), (0, y))
    return strip


def underside(traversal: Image.Image, x: int, below: int) -> int:
    """The lowest opaque row of the structure above `below` at column x: where the chain is fixed."""
    column = np.asarray(traversal.getchannel("A"))[:below, x] > 128
    rows = np.nonzero(column)[0]
    if not len(rows):
        raise ValueError(f"nothing to hang a chain from above x {x}")
    return int(rows[-1]) + 1


def build() -> tuple[Image.Image, list]:
    platform = frame("arena-platform", "platform-00")
    chain = frame("arena-chain", "chain-00")
    traversal = Image.open(REGION / "images" / "05-traversal-right.png").convert("RGBA")
    plate = Image.new("RGBA", traversal.size, (0, 0, 0, 0))
    lines = []
    for x, top in PLATFORMS:
        for cx in (x + CHAIN_INSET, x + platform.width - CHAIN_INSET):
            hook = underside(traversal, cx, top)
            plate.alpha_composite(chain_strip(chain, top - hook + 4), (cx - chain.width // 2, hook))
        plate.alpha_composite(platform, (x, top))
        lines.append([[x, top], [x + platform.width, top]])
    return plate, lines


def main() -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "export_atlas.py"), "arena-platform", "arena-chain",
                    "--out", str(ATLAS)], check=True, capture_output=True)
    plate, lines = build()
    plate.save(REGION / "arena" / "right.png", optimize=True)
    path = REGION / "rc-2-0.anomaly.collision.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["oneWay"] = [l for l in data["oneWay"] if not (ARENA[0] <= l[0][0] <= ARENA[1] and l[0][1] > 400)] + lines
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"arena platforms: {len(lines)} on chains -> {plate.size}, one-way lines {lines}")


if __name__ == "__main__":
    main()
