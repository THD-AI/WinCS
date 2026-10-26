"""Jenny's arena platforms (playtest J6): two girder platforms hung on chains from the railway girder over her arena.

    python scripts/arena_platforms.py            # writes art/stages/rusty-creek/arena/rc-2-1.png

The art is two sprite boards in the game's look (art/sprites boards.json): `arena-platform`, a short box girder in
the maze's own material, and `arena-chain`, a rusted chain. Exported at game size (export_atlas.py, into tmp/), they
are composed into one overlay plate for the right-hand level chunk's anomaly state (export.json `05-arena`,
"overlay"): each platform where the zone script puts it (rusty_creek_zone.PLATFORMS, which also writes their one-way
lines into rc-2-1.anomaly.collision.json), and a chain from each end of it straight up to the underside of the
railway girder above, measured from the chunk's play mask – so nothing floats.

Heights (arena.test.ts checks them): the tops 87 px over the walk line – a full jump is 96 px – and the bottoms
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
CHUNK = "rc-2-1"
CHAIN_INSET = 18                        # chain centre from each platform end (px)
sys.path.insert(0, str(ROOT / "scripts" / "zones"))
from rusty_creek_zone import PLATFORMS  # noqa: E402  left edge, top (chunk px); 202 px wide


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


def underside(play: np.ndarray, x: int, below: int) -> int:
    """The underside of the railway girder at column x: the end of the first run of play rows from the top (the
    girder), above `below` – where the chain is fixed."""
    column = play[:below, x]
    rows = np.nonzero(column)[0]
    if not len(rows):
        raise ValueError(f"nothing to hang a chain from above x {x}")
    y = int(rows[0])
    while y < below and column[y]:
        y += 1
    return y


def build() -> Image.Image:
    platform = frame("arena-platform", "platform-00")
    chain = frame("arena-chain", "chain-00")
    play = np.asarray(Image.open(REGION / "masks" / f"{CHUNK}.05-play.png").getchannel("A")) > 128
    plate = Image.new("RGBA", (play.shape[1], play.shape[0]), (0, 0, 0, 0))
    for x, top in PLATFORMS:
        for cx in (x + CHAIN_INSET, x + platform.width - CHAIN_INSET):
            hook = underside(play, cx, top)
            plate.alpha_composite(chain_strip(chain, top - hook + 4), (cx - chain.width // 2, hook))
        plate.alpha_composite(platform, (x, top))
    return plate


def main() -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "export_atlas.py"), "arena-platform", "arena-chain",
                    "--out", str(ATLAS)], check=True, capture_output=True)
    plate = build()
    (REGION / "arena").mkdir(exist_ok=True)
    plate.save(REGION / "arena" / f"{CHUNK}.png", optimize=True)
    data = json.loads((REGION / f"{CHUNK}.anomaly.collision.json").read_text(encoding="utf-8"))
    tops = {(x, top) for x, top in PLATFORMS}
    if not tops <= {(line[0][0], line[0][1]) for line in data["oneWay"]}:
        sys.exit(f"{CHUNK}.anomaly.collision.json lacks the platforms' one-way lines: run rusty_creek_zone.py --stage")
    print(f"arena platforms: {len(PLATFORMS)} on chains -> arena/{CHUNK}.png")


if __name__ == "__main__":
    main()
