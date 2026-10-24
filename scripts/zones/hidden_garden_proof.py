"""The Hidden Garden proof zone (docs/09 "World pipeline"): the shipped prologue row on top, the drained wrong
reflection grown under it – a 3 x 2 grid. Writes world.json, the top row's images and the lower row's guides.

    python scripts/zones/hidden_garden_proof.py

Top row: hg-2-0, hg-3-0, hg-4-0 (the shed terraces, the boardwalk, the jetty) composed from their own plates
without the near strip and the lens foreground (those stay parallax layers, never part of a neighbour's edge).
Lower row: guides for world_paint.py grow … down. Under the pond there are no caves (Alexander, 24 Oct): the deep
water ends in its surface seen from below, hanging as a ceiling over a drained hall – the wrong reflection – with a
brick cellar under the shed, a storm-drain outlet under the boardwalk and the girders hanging upside down under
the jetty. Rooms are 5+ hero heights (the hero is drawn 114 px).
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from grow_stage import GUIDE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ZONE = ROOT / "art" / "zones" / "hidden-garden"
STAGE = ROOT / "art" / "stages" / "hidden-garden"
W, H = 2160, 720
TOP = ["hg-2-0", "hg-3-0", "hg-4-0"]
LAYERS = ["00-sky", "01-far", "02-mid", "03-rear", "04-water", "05-play"]
CEILING = 210   # the water surface seen from below
FLOOR = 640     # the hall's silt floor (about where the walk line runs)

# What each lower room is in THIS game's story (docs/03): TH Deggendorf's campus, a quantum field experiment that
# makes the campus overlap with versions of itself, anomalies as living errors that possess the autonomous machines,
# Dexter the panther plush who leads you, shoves you into the pond and feeds on the black fluid they leak.
STORY = [
    {"room": "the garden cellar", "beat": "secret",
     "story": "Under the shed: the first archive note in a crate – an experiment log that mentions a "
              "'mascot-shaped containment vessel'. Warm light: a place to breathe (secret horror: calm first)."},
    {"room": "the storm-drain hall", "beat": "fight",
     "story": "The campus storm drain under the boardwalk – the game's IT room (secret horror: a friendly mascot "
              "luring you toward water and a drain): a paper boat from the pond washed against the outlet, one "
              "balloon resting against the water ceiling, two glossy plush eyes in the dark of the pipe that are "
              "gone on a second look. A possessed campus rover patrols the silt; black fluid drips from the outlet "
              "and runs toward the jetty – what Dexter will absorb."},
    {"room": "the wrong reflection", "beat": "reveal",
     "story": "Under the jetty, where Dexter shoves you: the pond's wrong reflection made real – girders that are not "
              "above hang upside down from the water, the overlap of another campus showing through. The way on to "
              "Rusty Creek's rust maze."},
]

BRIEFS = [
    "Under the pond, below the shed's stone terraces: deep green-blue pond water at the top, then its surface seen "
    "from below hanging like a ceiling, and under it a drained brick cellar of the old garden – arches, a heavy "
    "wooden door with a warm lantern, crates, roots hanging through the vault. Built space, never a natural cave.",
    "Under the pond, below the boardwalk and the reeds: deep water at the top, its surface hanging as a ceiling, and "
    "under it a drained hall of the German campus storm drain: a round concrete outlet in the wall with a small paper "
    "boat washed against its grate, a single balloon resting against the water ceiling, a rusty ladder up a shaft, "
    "silt and puddles on the floor, roots and weed hanging from the water ceiling. Quiet and pretty first, wrong on "
    "a second look. Built space, never a natural cave.",
    "Under the jetty, the heart of the wrong reflection: deep water at the top, its surface hanging as a ceiling, and "
    "rusty blue-green girders with ladders hanging UPSIDE DOWN from it, mirroring girders that are not there above; "
    "cold rippling blue-green light on the silt floor. Wrong, quiet, beautiful. Built space, never a natural cave.",
]


def compose(chunk: str) -> Image.Image:
    """The chunk's plates z 0–5 with their hidden fills under them: the picture without near strip and lens."""
    out = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    for layer in LAYERS:
        fill = STAGE / "fills" / f"{chunk}.{layer}.png"
        if fill.exists():
            out.alpha_composite(Image.open(fill).convert("RGBA"))
        out.alpha_composite(Image.open(STAGE / "layers" / f"{chunk}.{layer}.png").convert("RGBA"))
    return out.convert("RGB")


def floor_line(col: int) -> list[tuple[int, int]]:
    """A soft silt floor: long low swells in zone x, so neighbours meet at the same height; never steps."""
    return [(x, round(FLOOR + 14 * math.sin((col * W + x) / 520) + 8 * math.sin((col * W + x) / 190)))
            for x in range(0, W + 1, 8)]


def guide(col: int) -> Image.Image:
    img = Image.new("RGB", (W, H), GUIDE["hollow"])
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, CEILING), fill=GUIDE["water"])
    floor = floor_line(col)
    d.polygon(floor + [(W, H), (0, H)], fill=GUIDE["ground"])
    if col == 0:   # brick cellar: arches and a door in the back wall
        for x in (240, 900, 1560):
            d.rectangle((x, CEILING, x + 60, FLOOR), fill=GUIDE["structure"])
        d.rectangle((1180, FLOOR - 170, 1300, FLOOR), fill=GUIDE["structure"])
    if col == 1:   # storm-drain outlet and a shaft ladder
        d.ellipse((300, FLOOR - 260, 560, FLOOR), fill=GUIDE["structure"])
        d.rectangle((1500, 0, 1530, FLOOR), fill=GUIDE["ladder"])
    if col == 2:   # girders hanging upside down from the water ceiling
        for x0, x1, y in ((200, 980, 420), (1150, 1900, 470)):
            d.rectangle((x0, y, x1, y + 22), fill=GUIDE["structure"])
            d.rectangle((x0 + 40, CEILING, x0 + 64, y), fill=GUIDE["structure"])
            d.rectangle((x1 - 64, CEILING, x1 - 40, y), fill=GUIDE["structure"])
        d.rectangle((560, 442, 590, FLOOR), fill=GUIDE["ladder"])
    d.line(floor, fill=GUIDE["walk"], width=6)
    for x0, x1, y in ((200, 980, 420), (1150, 1900, 470)) if col == 2 else ():
        d.line([(x0, y), (x1, y)], fill=GUIDE["walk"], width=6)
    return img


def main() -> None:
    (ZONE / "images").mkdir(parents=True, exist_ok=True)
    (ZONE / "blockout").mkdir(exist_ok=True)
    chunks = {}
    for col, src in enumerate(TOP):
        cid = f"hgz-{col}-0"
        compose(src).save(ZONE / "images" / f"{cid}.png")
        chunks[cid] = {"id": cid, "col": col, "row": 0, "band": "level", "role": "the prologue (shipped)",
                       "brief": f"the shipped prologue chunk {src}", "source": src}
    for col in range(3):
        cid = f"hgz-{col}-1"
        guide(col).save(ZONE / "blockout" / f"{cid}.png")
        chunks[cid] = {"id": cid, "col": col, "row": 1, "band": "below", "role": STORY[col]["room"],
                       "brief": BRIEFS[col], "beat": STORY[col]["beat"], "story": STORY[col]["story"]}
    world = {"zone": "hidden-garden", "seed": 0, "chunk": [W, H], "grid": [3, 2], "prefix": "hgz", "chunks": chunks,
             "links": [{"a": "hgz-0-1", "b": "hgz-1-1", "by": "door"}, {"a": "hgz-1-1", "b": "hgz-2-1", "by": "door"},
                       {"a": "hgz-1-0", "b": "hgz-1-1", "by": "shaft", "at": 1515}],
             "anomaly": {"tears": [
                 {"kind": "cut", "chunk": "hgz-1-0", "box": [700, 40, 1260, 180], "seed": 404},
                 {"kind": "stretch", "chunk": "hgz-2-0", "box": [1300, 60, 1560, 420], "from": 420, "seed": 7}]}}
    (ZONE / "world.json").write_text(json.dumps(world, indent=1) + "\n", encoding="utf-8")
    print(f"hidden-garden proof: {len(chunks)} chunks, guides for the lower row in {ZONE / 'blockout'}")


if __name__ == "__main__":
    main()
