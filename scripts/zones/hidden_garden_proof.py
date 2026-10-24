"""The Hidden Garden proof zone (docs/09 "World pipeline"): the shipped prologue row on top, the drained wrong
reflection grown under it – a 3 x 2 grid. Writes world.json, the top row's images, the lower row's guides and every
chunk's collision, and checks that the whole grid can be walked both ways. No band above the pond: girders over the
garden read out of context (Alexander, 24 Oct).

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


SHAFT = (1540, 1580)   # the storm-drain shaft from the boardwalk (hg-3-0) down the drain hall's painted ladder
def box(x0: int, y0: int, x1: int, y1: int, **extra) -> dict:
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, **extra}


def carve(boxes: list[dict], x0: int, x1: int) -> list[dict]:
    """Water boxes with the column x0..x1 cut out (a shaft through the pond)."""
    out = []
    for b in boxes:
        if b.get("kind") == "water" and b["x"] < x1 and b["x"] + b["w"] > x0:
            if b["x"] < x0:
                out.append({**b, "w": x0 - b["x"]})
            if b["x"] + b["w"] > x1:
                out.append({**b, "x": x1, "w": b["x"] + b["w"] - x1})
        else:
            out.append(b)
    return out


def collision(cid: str, col: int, row: int, source: str | None) -> dict:
    """The chunk in the game's collision format, from the same data the guides are drawn from."""
    data = {"chunk": cid, "state": "anomaly", "size": [W, H], "walk": [], "slide": [], "oneWay": [], "climb": [],
            "solid": [], "noGo": [], "hazard": [], "interact": []}
    if row == 0:
        shipped = json.loads((STAGE / f"{source}.clean.collision.json").read_text(encoding="utf-8"))
        data.update({k: shipped[k] for k in ("walk", "slide", "oneWay", "climb", "solid", "noGo", "hazard")})
        data["interact"] = [i for i in shipped.get("interact", []) if i.get("kind") not in ("chunk-exit", "anomaly")]
        if col == 1:   # the storm-drain shaft from the boardwalk, down through the pond
            data["noGo"] = carve(data["noGo"], SHAFT[0] - 10, SHAFT[1] + 10)
            data["climb"] = data["climb"] + [box(SHAFT[0], 380, SHAFT[1], H, kind="ladder")]
        return data
    bands = key_bands(cid)
    if bands is None:  # before the depth key: the guide's own floor, ceiling and ladders
        data["walk"] = [[[x, y] for x, y in floor_line(col)]]
        data["noGo"] = [box(0, 0, W, CEILING - 40, kind="water")]
        if col == 1:
            data["noGo"] = carve(data["noGo"], SHAFT[0] - 10, SHAFT[1] + 10)
            data["climb"] = [box(SHAFT[0], 0, SHAFT[1], FLOOR, kind="ladder")]
        if col == 2:
            data["oneWay"] = [[[x0, y], [x1, y]] for x0, x1, y in ((200, 980, 420), (1150, 1900, 470))]
            data["climb"] = [box(560, 420, 590, FLOOR, kind="ladder")]
    else:  # stage 7: traced from the painting's depth key, so the floors are where the art has them
        water = (bands == "water").mean(1) > 0.6
        ceiling = next((y for y in range(H) if not water[y]), 0)  # the water band at the top, seen from below
        steps = ladders(bands)
        data["walk"] = floors(bands, steps, ceiling + 8)
        if not any(max(y for _, y in line) > FLOOR - 80 for line in data["walk"]):
            data["walk"].append([[x, y] for x, y in floor_line(col)])  # the key read the floor as rock: the guide's
        data["noGo"] = [box(0, 0, W, ceiling, kind="water")] if ceiling else []
        # the painted ladder under the shaft takes the shaft's exact columns, so the two pieces are one ladder
        shaft = [(x0, x1) for x0, x1, _, _ in steps if col == 1 and x0 <= SHAFT[1] and x1 >= SHAFT[0]]
        data["climb"] = [box(SHAFT[0], 0, SHAFT[1], bottom, kind="ladder") if (x0, x1) in shaft else
                         box(x0, max(top, ceiling), x1, bottom, kind="ladder") for x0, x1, top, bottom in steps]
        if col == 1:
            data["noGo"] = carve(data["noGo"], SHAFT[0] - 10, SHAFT[1] + 10)
    data["interact"] = [{"id": f"{cid}-{STORY[col]['beat']}", "kind": STORY[col]["beat"], "x": 1000, "y": FLOOR - 120,
                         "w": 120, "h": 120, "note": STORY[col]["story"]}]
    return data


def key_bands(cid: str):
    """The chunk's depth key (depth_layers.py key) as an H x W array of band names, or None before it exists."""
    import numpy as np
    import depth_layers as dl
    path = ROOT / "tmp" / "boards" / ZONE.name / f"{cid}--depth.png"
    if not path.exists():
        return None
    key = Image.open(path).resize((W, H), Image.Resampling.NEAREST)
    return np.array(dl.vote(dl.snap(key), (W, H))).reshape(H, W)


def ladders(bands) -> list[tuple[int, int, int, int]]:
    """Ladders in the key: columns where the play colour flips 16+ times (rungs), 8+ px wide -> (x0, x1, top, bottom)."""
    import numpy as np
    red = bands == "play"
    flips = (red[1:] != red[:-1]).sum(0)
    out, start = [], None
    for x in range(W + 1):
        hit = x < W and flips[x] >= 16
        if hit and start is None:
            start = x
        if not hit and start is not None:
            if x - start >= 8:
                mid = red[:, (start + x) // 2]
                ys = np.flatnonzero(mid[1:] != mid[:-1])
                out.append((start, x, int(ys.min()), int(ys.max()) + 1))
            start = None
    return out


def floors(bands, skip: list[tuple[int, int, int, int]], top: int) -> list[list[list[int]]]:
    """Walk lines along the tops of the key's play band (10+ px thick, below `top`), linked column to column
    within 8 px and across gaps up to 160 px (a pillar or a ladder in front of the floor is scenery, not a wall);
    lines shorter than 120 px are dropped; a point every 48 px."""
    import numpy as np
    red = bands == "play"
    thick = np.ones_like(red)
    for d in range(10):
        thick[:H - d] &= red[d:]
        thick[H - d:] = False
    tops = thick & ~np.vstack([np.zeros((1, W), bool), red[:-1]])
    lines, active = [], []
    for x in range(0, W, 4):
        if any(x0 - 4 <= x <= x1 + 4 for x0, x1, _, _ in skip):
            continue
        nxt = []
        for y in np.flatnonzero(tops[:, x]):
            if y < top:
                continue
            line = next((l for l in active if abs(l[-1][1] - y) <= 8 and x - l[-1][0] <= 160 and l not in nxt), None)
            if line is None:
                line = []
                lines.append(line)
            line.append((x, int(y)))
            nxt.append(line)
        active = nxt + [l for l in active if l not in nxt and x - l[-1][0] <= 160]
    out = []
    for line in lines:
        if line[-1][0] - line[0][0] < 120:
            continue
        pts = [line[0]] + [p for p in line[1:-1] if p[0] - line[0][0] >= 48 and (p[0] - line[0][0]) % 48 < 4] + [line[-1]]
        out.append([[x, y] for x, y in dict(pts).items()])
    return out


def reach(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> list[str]:
    """Two-way reachability over the whole grid (world_map.check, fed from the collision files)."""
    import world_map as wm
    chunks = {}
    for cid, data in collisions.items():
        col, row = grid[cid]
        lines = [[line[0], line[-1]] for line in data["walk"] if len(line) == 2]
        for line in data["walk"]:  # curves: one flat run per segment, as world_map reads walk lines
            if len(line) > 2:
                lines += [[a, b] for a, b in zip(line, line[1:])]
        chunks[cid] = {"id": cid, "col": col, "row": row, "band": "level" if row == 0 else "other",
                       "walk": lines, "oneWay": data["oneWay"], "deck": [],
                       "climb": [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["climb"]],
                       "solid": [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["solid"]]}
    return wm.check({"chunks": chunks})


def main() -> None:
    (ZONE / "images").mkdir(parents=True, exist_ok=True)
    (ZONE / "blockout").mkdir(exist_ok=True)
    (ZONE / "collision").mkdir(exist_ok=True)
    chunks = {}
    for col, src in enumerate(TOP):
        cid = f"hgz-{col}-0"
        if not (ZONE / "images" / f"{cid}.png").exists():  # the zone's copy may carry a painted feature
            compose(src).save(ZONE / "images" / f"{cid}.png")
        chunks[cid] = {"id": cid, "col": col, "row": 0, "band": "level", "role": "the prologue (shipped)",
                       "brief": f"the shipped prologue chunk {src}", "source": src}
    for col in range(3):
        cid = f"hgz-{col}-1"
        guide(col).save(ZONE / "blockout" / f"{cid}.png")
        chunks[cid] = {"id": cid, "col": col, "row": 1, "band": "below", "role": STORY[col]["room"],
                       "brief": BRIEFS[col], "beat": STORY[col]["beat"], "story": STORY[col]["story"]}
    grid = {cid: (c["col"], c["row"]) for cid, c in chunks.items()}
    collisions = {cid: collision(cid, c["col"], c["row"], c.get("source")) for cid, c in chunks.items()}
    for cid, data in collisions.items():
        (ZONE / "collision" / f"{cid}.collision.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    world = {"zone": "hidden-garden", "seed": 0, "chunk": [W, H], "grid": [3, 2], "prefix": "hgz", "chunks": chunks,
             "links": [{"a": "hgz-0-1", "b": "hgz-1-1", "by": "door"}, {"a": "hgz-1-1", "b": "hgz-2-1", "by": "door"},
                       {"a": "hgz-1-0", "b": "hgz-1-1", "by": "shaft", "at": sum(SHAFT) // 2}],
             "anomaly": {"tears": [
                 {"kind": "cut", "chunk": "hgz-1-0", "box": [700, 40, 1260, 180], "seed": 404},
                 {"kind": "stretch", "chunk": "hgz-2-0", "box": [1300, 60, 1560, 420], "from": 420, "seed": 7}]}}
    (ZONE / "world.json").write_text(json.dumps(world, indent=1) + "\n", encoding="utf-8")
    problems = reach(collisions, grid)
    print(f"hidden-garden: {len(chunks)} chunks (3 x 2), collision written; reachability: "
          + ("every surface reachable and leavable" if not problems else f"{len(problems)} problems, e.g. {problems[:4]}"))


if __name__ == "__main__":
    main()
