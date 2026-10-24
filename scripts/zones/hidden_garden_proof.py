"""The Hidden Garden proof zone (docs/09 "World pipeline"): the shipped prologue row on top, the drained wrong
reflection grown under it – a 3 x 2 grid. Writes world.json, the top row's images, the lower row's guides and every
chunk's collision, and checks that the whole grid can be walked both ways. No band above the pond: girders over the
garden read out of context (Alexander, 24 Oct).

    python scripts/zones/hidden_garden_proof.py            # world.json, guides, collision, reachability
    python scripts/zones/hidden_garden_proof.py --stage    # the underground into the game's Hidden Garden

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


# The way down is the shed's own door (hg-2-0, painted at x 1095-1175 over the terrace path at y 306): the cellar
# lies straight under the shed, and its stairs door is right below the shed door. No shaft through the pond: the
# pond is the prologue's finale, and the shed door you should not open is the secret (Alexander, 24 Oct).
SHED_DOOR = (1095, 1175)
GIRDER_TOP = 400   # a traced floor above this is a girder hanging from the water (the reflection)
BODY = 76      # the hero's body height: a ladder top keeps it below the water ceiling

# What you find down there (docs/03: archive notes hint at the experiment and never explain it; the rest is wordless).
# (col, id, x centre, which floor: "low" / "high" (the one above the lowest) / "top", title, text) – placed on the traced floor.
FINDS = [
    (0, "q7-sheet-3", 980, "low", "FELDVERSUCH Q-7 – Protokoll, Blatt 3",
     "Coherence holds 11 s. The pond shows the campus twice.\nIn the second copy the rovers are already awake.\n"
     "Containment vessel ordered: 1 x mascot-shaped, Campus Store, 1.5 ft. It fits."),
    (0, "q7-margin", 2080, "top", "(pencil, on the back of Blatt 3)",
     "It waves.\nNobody taught it to wave."),
    (1, "drain-report", 1110, "low", "Stadtentwässerung Deggendorf – Wartungsbericht, Auslass 4",
     "Grate replaced twice. Opened from the inside both times.\nAt the outlet: 1 paper boat (dry). 1 red balloon, "
     "resting against the underside of the pond. It does not float up.\nThe outlet hums at night. The campus jingle."),
    (1, "balloon-string", 760, "top", "(a string, tied to the rail)",
     "The string goes up into the water.\nSomething on the other end tugs back. Twice. Friendly."),
    (2, "q7-sheet-9", 1880, "low", "FELDVERSUCH Q-7 – Blatt 9 (wet)",
     "Down here everything is the right way round.\nIt is the garden that hangs upside down.\nDo not feed the vessel."),
]
ROVER = (1, 640, 1200)   # the drain hall's possessed campus rover (docs/03): col, patrol x0, x1 on its floor


def floor_at(lines: list, x: int, which: str) -> int:
    """The traced floor under x: the lowest ("low"), the one above it ("high"), or the topmost ("top")."""
    ys = sorted({round(a[1] + (b[1] - a[1]) * (x - a[0]) / max(1, b[0] - a[0]))
                 for line in lines for a, b in zip(line, line[1:]) if a[0] <= x <= b[0]})
    if not ys:
        raise ValueError(f"no floor under x {x}")
    return ys[-1] if which == "low" else ys[-2] if which == "high" and len(ys) > 1 else ys[0]


def box(x0: int, y0: int, x1: int, y1: int, **extra) -> dict:
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, **extra}


def collision(cid: str, col: int, row: int, source: str | None) -> dict:
    """The chunk in the game's collision format, from the same data the guides are drawn from."""
    data = {"chunk": cid, "state": "anomaly", "size": [W, H], "walk": [], "slide": [], "oneWay": [], "climb": [],
            "solid": [], "noGo": [], "hazard": [], "interact": []}
    if row == 0:
        shipped = json.loads((STAGE / f"{source}.clean.collision.json").read_text(encoding="utf-8"))
        data.update({k: shipped[k] for k in ("walk", "slide", "oneWay", "climb", "solid", "noGo", "hazard")})
        data["interact"] = [i for i in shipped.get("interact", []) if i.get("kind") not in ("chunk-exit", "anomaly", "door")]
        if col == 0:
            data["interact"].append(shed_door())
        return data
    bands = key_bands(cid)
    if bands is None:  # before the depth key: the guide's own floor, ceiling and ladders
        data["walk"] = [[[x, y] for x, y in floor_line(col)]]
        data["noGo"] = [box(0, 0, W, CEILING - 40, kind="water")]
        if col == 2:
            data["oneWay"] = [[[x0, y], [x1, y]] for x0, x1, y in ((200, 980, 420), (1150, 1900, 470))]
            data["climb"] = [box(560, 420, 590, FLOOR, kind="ladder")]
    else:  # stage 7: traced from the painting's depth key, so the floors are where the art has them
        water = (bands == "water").mean(1) > 0.6
        ceiling = next((y for y in range(H) if not water[y]), 0)  # the water band at the top, seen from below
        steps = ladders(bands)
        data["walk"] = headroom(floors(bands, steps, ceiling + HEADROOM))
        if not any(max(y for _, y in line) > FLOOR - 80 for line in data["walk"]):
            data["walk"].append(seabed(bands, col))  # the key painted the floor as rock and weed, not play: its top
        # A beam is straight: a traced line high in the hall (a girder hanging from the water) is one flat tread.
        data["walk"] = [[[line[0][0], y], [line[-1][0], y]] if max(p[1] for p in line) < GIRDER_TOP
                        and (y := sorted(p[1] for p in line)[len(line) // 2]) else line for line in data["walk"]]
        data["noGo"] = [box(0, 0, W, ceiling, kind="water")] if ceiling else []
        # a ladder top keeps the climbing body (BODY px) under the water ceiling and inside the room
        data["climb"] = [box(x0, max(top, ceiling + BODY + 8), x1, bottom, kind="ladder", id=f"{cid}-ladder-{n}")
                         for n, (x0, x1, top, bottom) in enumerate(steps)]
        data["walk"] = walkable(cid, data["walk"], data["climb"])
    data["interact"] = finds(cid, col, data["walk"])
    data["spawn"] = []
    if col == ROVER[0] and bands is not None:
        x = (ROVER[1] + ROVER[2]) // 2
        data["spawn"] = [{"id": f"{cid}-rover", "kind": "rover", "x": x, "y": floor_at(data["walk"], x, "low"),
                          "patrol": [ROVER[1], ROVER[2]], "note": STORY[col]["story"]}]
    return data


def shed_door() -> dict:
    """The shed's painted door, over the terrace path (hg-2-0)."""
    return box(SHED_DOOR[0], 306 - BODY, SHED_DOOR[1], 306, kind="door", id="shed-door", to="cellar-stairs",
               note="The shed door you should not open: stairs down to the cellar.")


def finds(cid: str, col: int, walk: list) -> list[dict]:
    """The row-below chunk's interacts: the cellar's stairs door (under the shed door) and the archive notes."""
    out = []
    if col == 0 and walk:
        x = (SHED_DOOR[0] + SHED_DOOR[1]) // 2
        y = floor_at(walk, x, "high")
        out.append(box(SHED_DOOR[0], y - BODY, SHED_DOOR[1], y, kind="door", id="cellar-stairs", to="shed-door",
                       note=STORY[0]["story"]))
    for c, nid, x, which, title, text in FINDS:
        if c == col and walk:
            y = floor_at(walk, x, which)
            out.append(box(x - 30, y - 60, x + 30, y, kind="note", id=nid, title=title, text=text))
    return out


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
    """Ladders in the key: columns where the play colour flips 16+ times (rungs), 16+ px wide -> (x0, x1, top, bottom)."""
    import numpy as np
    red = bands == "play"
    flips = (red[1:] != red[:-1]).sum(0)
    out, start = [], None
    for x in range(W + 1):
        hit = x < W and flips[x] >= 16
        if hit and start is None:
            start = x
        if not hit and start is not None:
            if x - start >= 16:  # narrower is a pillar's edge, not a ladder
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


def seabed(bands, col: int) -> list[list[int]]:
    """Where the key paints the floor as rock and weed (rear, foreground), not play: the guide's floor, sunk to the
    rock's top wherever the key has water under the feet (a dip between the rocks) – never standing on water. A
    boulder above it is back wall the hero walks in front of. Median over 33 px, a point every 48 px."""
    import numpy as np
    guide = dict(floor_line(col))
    tops = []
    for x in range(W):
        y = guide[x - x % 8] if x - x % 8 in guide else guide[max(guide)]
        while y + 4 < H - 8 and bands[y + 4, x] == "water":
            y += 1
        tops.append(y)
    tops = np.array([int(np.median(tops[max(0, x - 16):x + 17])) for x in range(W)])
    return [[x, int(tops[min(x, W - 1)])] for x in list(range(0, W, 48)) + [W]]


EDGE = 64      # a traced floor this close to the chunk's edge is cut by a pillar in front: it runs on to the edge
JUMP = 88      # the highest ledge a held jump reaches (collision_check RISE); 88-120 px faces block and can't be jumped


def walkable(cid: str, lines: list, climbs: list[dict]) -> list:
    """The traced floors as the hero's body meets them (body.ts, collision_check.py):
    - a floor ending less than EDGE px from the chunk's edge goes on to the edge (rooms join at the seams);
    - never on water: a point with water under the feet (the zone's water mask) sinks to the ground under it;
    - a floor whose end stands 88-120 px over the floor beside it, with no ladder there, is a crate stack or a
      rubble ledge you could neither jump onto nor walk under: it would wall off the floor, so it goes (the hero
      walks in front of it, it is back wall)."""
    import numpy as np
    out = []
    for line in lines:
        line = [list(p) for p in line]
        if line[0][0] < EDGE:
            line[0][0] = 0
        if line[-1][0] > W - EDGE:
            line[-1][0] = W
        out.append(line)
    def y_at(line, x):
        return next((a[1] + (b[1] - a[1]) * (x - a[0]) / max(1, b[0] - a[0]) for a, b in zip(line, line[1:])
                     if a[0] <= x <= b[0]), None)

    water = ZONE / "masks" / f"{cid}.04-water.png"
    play = ZONE / "masks" / f"{cid}.05-play.png"
    if water.exists():
        wet = np.asarray(Image.open(water).getchannel("A")) > 128
        solid = np.asarray(Image.open(play).getchannel("A")) > 128 if play.exists() else np.zeros_like(wet)
        under = lambda x, y: y + 4 < H - 8 and wet[y + 4, min(x, W - 1)] and not solid[y + 4, min(x, W - 1)]  # noqa: E731
        for n, line in enumerate(out):
            pts = [[x, round(y_at(line, x))] for x in range(line[0][0], line[-1][0], 8)] + [line[-1]]
            flags = [under(x, y) for x, y in pts]
            i = 0
            while i < len(pts):  # a pool (64+ px of water under the feet) sinks to its bed; a stream is walked through
                j = i
                while j < len(pts) and flags[j]:
                    j += 1
                if j - i >= 8:
                    for p in pts[i:j]:
                        while under(*p):
                            p[1] += 1
                i = max(j, i + 1)
            out[n] = [p for k, p in enumerate(pts) if k in (0, len(pts) - 1) or p[1] != pts[k - 1][1] or k % 6 == 0]
    # Pieces a pillar or a stream split by a few px are one floor: the body (body.ts) falls through any gap under
    # its centre, so a piece that ends closer to the next than the body is wide (28 px), runs on until they meet.
    for line in out:
        nxt = [o for o in out if o is not line and 0 < o[0][0] - line[-1][0] <= 28 and abs(o[0][1] - line[-1][1]) <= JUMP]
        if nxt:
            line[-1][0] = min(o[0][0] for o in nxt)
    changed = True
    while changed:
        changed = False
        for line in out:
            for (x, top), side in ((line[0], -1), (line[-1], 1)):
                beside = [h for o in out if o is not line and (h := y_at(o, x + 8 * side)) is not None and h > top]
                ladder = any(c["x"] - 24 <= x <= c["x"] + c["w"] + 24 for c in climbs)
                if beside and JUMP < min(beside) - top <= 120 and not ladder:
                    out.remove(line)
                    changed = True
                    break
            if changed:
                break
    return out


HEADROOM = 90  # the hero is 76 px tall: a floor needs this much free space above it (no floor, no water)


def headroom(lines: list[list[list[int]]]) -> list[list[list[int]]]:
    """Cut a traced floor where another floor lies less than HEADROOM above it: the hero can't stand there (the
    weeds on a floor, the inside of a thick ledge). What is left in runs of 48+ px stays, a point every 48 px."""
    def y_at(line, x):
        for (x0, y0), (x1, y1) in zip(line, line[1:]):
            if x0 <= x <= x1:
                return y0 + (y1 - y0) * (x - x0) / max(1, x1 - x0)
        return None
    keep = []
    for line in lines:
        free = [(x, round(y_at(line, x))) for x in range(line[0][0], line[-1][0] + 1, 8)
                if not any(other is not line and (yo := y_at(other, x)) is not None and 0 < y_at(line, x) - yo < HEADROOM
                           for other in lines)]
        run: list[tuple[int, int]] = []
        for p in free + [(10 ** 9, 0)]:
            if run and p[0] - run[-1][0] > 8:
                if run[-1][0] - run[0][0] >= 48:
                    pts = [q for q in run if (q[0] - run[0][0]) % 48 == 0] + [run[-1]]
                    keep.append([list(q) for q in dict(pts).items()])
                run = []
            run.append(p)
    return keep


def reachable_only(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> int:
    """Remove the walk segments nobody can reach or leave (world_map's graph over the whole grid): a girder hanging
    from the water ceiling is scenery, not floor. Returns how many segments went."""
    import world_map as wm
    bad = {(p.split()[0], int(p.split()[3].split("-")[0]), int(p.split()[5].rstrip(":")))
           for p in wm.check(graph(collisions, grid)) if p.split()[1] == "walk"}
    gone = 0
    for cid, data in collisions.items():
        if grid[cid][1] == 0:
            continue  # the shipped row is the shipped row
        ox, oy = grid[cid][0] * W, grid[cid][1] * H
        lines = []
        for line in data["walk"]:
            run = [line[0]]
            for a, b in zip(line, line[1:]):
                if (cid, ox + a[0], oy + a[1]) in bad:
                    gone += 1
                    if len(run) > 1:
                        lines.append(run)
                    run = [b]
                else:
                    run.append(b)
            if len(run) > 1:
                lines.append(run)
        data["walk"] = lines
    return gone


def graph(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> dict:
    """The collision files as world_map reads a world: one flat run per walk segment. A door pair becomes a ladder
    between the two doors' floors (the doors sit one above the other), so the graph walks through it."""
    chunks = {}
    for cid, data in collisions.items():
        col, row = grid[cid]
        climb = [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["climb"]]
        for door in (b for b in data["interact"] if b.get("kind") == "door"):
            climb.append([door["x"], door["y"], door["x"] + door["w"], H] if row == 0 else
                         [door["x"], 0, door["x"] + door["w"], door["y"] + door["h"]])
        chunks[cid] = {"id": cid, "col": col, "row": row, "band": "level" if row == 0 else "other",
                       "walk": [[a, b] for line in data["walk"] for a, b in zip(line, line[1:])],
                       "oneWay": data["oneWay"], "deck": [], "climb": climb,
                       "solid": [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["solid"]]}
    return {"chunks": chunks}


def reach(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> list[str]:
    """Two-way reachability over the whole grid (world_map.check, fed from the collision files)."""
    import world_map as wm
    return wm.check(graph(collisions, grid))


UNDER = {col: f"hg-{col + 2}-1" for col in range(3)}  # the zone's row below -> stage chunks under hg-2-0 … hg-4-0
FOOTING = {0: "stone", 1: "stone", 2: "earth"}       # brick cellar, concrete drain, the reflection's silt
STEEL = {"sink": 0, "cover": 0, "puff": {"sprite": "dust", "shape": "dust",
                                          "colors": ["#8a5a3a", "#b07a4e", "#5e6f73"], "count": 3}}


def export_stage() -> None:
    """The zone's underground into the game's Hidden Garden (art/stages/hidden-garden), as a second row of chunks
    under the shed, the boardwalk and the jetty: the painting, its depth masks as layers.json rules (water, play,
    and the weeds in front as 06-near, which scrolls with the ground and is drawn over the hero; the rest is the
    back wall), export.json grid places, and the collision with typed terrain. The shipped row only gains the shed
    door. Then: split_layers.py, export_stage.py, collision_check.py --surfaces."""
    import shutil
    layers = json.loads((STAGE / "layers.json").read_text(encoding="utf-8"))
    export = json.loads((STAGE / "export.json").read_text(encoding="utf-8"))
    surfaces = json.loads((STAGE / "surfaces.json").read_text(encoding="utf-8"))
    for col, sid in UNDER.items():
        zid = f"hgz-{col}-1"
        shutil.copy(ZONE / "images" / f"{zid}.png", STAGE / "images" / f"{sid}.png")
        rules = []
        for source, layer in MASKS:
            mask = ZONE / "masks" / f"{zid}.{source}.png"
            if mask.exists():
                shutil.copy(mask, STAGE / "masks" / f"{sid}.{layer}.png")
                rules.append({"layer": layer, "alpha": f"masks/{sid}.{layer}.png"})
        layers["chunks"][sid] = {"states": {"clean": f"images/{sid}.png"}, "default": "03-rear", "rules": rules}
        export["chunks"][sid] = {"x": col + 2, "y": 1}
        data = json.loads((ZONE / "collision" / f"{zid}.collision.json").read_text(encoding="utf-8"))
        data.update({"chunk": sid, "state": "clean", "ledge": [], "glideLift": []})
        for spawn in data["spawn"]:
            spawn["id"] = spawn["id"].replace(zid, sid)
        data["terrain"] = []
        for line in data["walk"]:
            ys = [y for _, y in line]
            girder = col == 2 and max(ys) < GIRDER_TOP
            data["terrain"].append({"x": [line[0][0], line[-1][0]], "y": [min(ys) - 12, max(ys) + 12],
                                    "kind": "plank" if girder else "ground",
                                    "material": "steel" if girder else FOOTING[col],
                                    "note": "a girder hanging from the water" if girder else "the floor"})
        (STAGE / f"{sid}.clean.collision.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n",
                                                           encoding="utf-8")
    shed = json.loads((STAGE / "hg-2-0.clean.collision.json").read_text(encoding="utf-8"))
    shed["interact"] = [i for i in shed["interact"] if i.get("kind") != "door"] + [shed_door()]
    (STAGE / "hg-2-0.clean.collision.json").write_text(json.dumps(shed, indent=1, ensure_ascii=False) + "\n",
                                                       encoding="utf-8")
    for path, data in ((STAGE / "layers.json", layers), (STAGE / "export.json", export)):
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if "steel" not in surfaces["materials"]:  # the reflection's girders (collision_check --surfaces lays the ranges)
        surfaces["materials"]["steel"] = STEEL
        (STAGE / "surfaces.json").write_text(json.dumps(surfaces, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"hidden-garden stage: {', '.join(UNDER.values())} under the level row; the shed door in hg-2-0")


MASKS = (("04-water", "04-water"), ("05-play", "05-play"), ("07-foreground", "06-near"))  # zone band -> stage layer


def from_stage() -> None:
    """Once exported, the stage holds the one committed copy of the underground's painting and masks (check_docs:
    no duplicates); on a fresh checkout the zone's working copies come back from it."""
    import shutil
    (ZONE / "masks").mkdir(exist_ok=True)
    for col, sid in UNDER.items():
        zid = f"hgz-{col}-1"
        pairs = [(STAGE / "images" / f"{sid}.png", ZONE / "images" / f"{zid}.png")]
        pairs += [(STAGE / "masks" / f"{sid}.{layer}.png", ZONE / "masks" / f"{zid}.{band}.png") for band, layer in MASKS]
        for stage, zone in pairs:
            if stage.exists() and not zone.exists():
                shutil.copy(stage, zone)


def main() -> None:
    if "--stage" in sys.argv:
        export_stage()
        return
    from_stage()
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
    gone = reachable_only(collisions, grid)
    for cid, data in collisions.items():
        (ZONE / "collision" / f"{cid}.collision.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    world = {"zone": "hidden-garden", "seed": 0, "chunk": [W, H], "grid": [3, 2], "prefix": "hgz", "chunks": chunks,
             "links": [{"a": "hgz-0-1", "b": "hgz-1-1", "by": "walk"}, {"a": "hgz-1-1", "b": "hgz-2-1", "by": "walk"},
                       {"a": "hgz-0-0", "b": "hgz-0-1", "by": "door", "at": sum(SHED_DOOR) // 2}],
             "anomaly": {"tears": [
                 {"kind": "cut", "chunk": "hgz-1-0", "box": [700, 40, 1260, 180], "seed": 404},
                 {"kind": "stretch", "chunk": "hgz-2-0", "box": [1300, 60, 1560, 420], "from": 420, "seed": 7}]}}
    (ZONE / "world.json").write_text(json.dumps(world, indent=1) + "\n", encoding="utf-8")
    problems = reach(collisions, grid)
    print(f"hidden-garden: {len(chunks)} chunks (3 x 2), collision written ({gone} unreachable floor segments dropped); reachability: "
          + ("every surface reachable and leavable" if not problems else f"{len(problems)} problems, e.g. {problems[:4]}"))


if __name__ == "__main__":
    main()
