"""World pipeline stages 0–1: a seeded, playable zone map and its blockout (docs/09 "World pipeline").

    python scripts/world_map.py art/zones/<zone> [--seed N] [--grid COLSxROWS]

zone.json (by hand) gives the concept, the vocabulary per band and a seed. This script generates a different map
for every seed – never the concept's layout or scale – and writes, beside zone.json:

    world.json                      the grid, each chunk's band, role, brief and features, the links, the beats,
                                    the 404 tears (placed, drawn later as fx)
    blockout/<chunk>.png            the flat layout guide the paint stage paints over (grow_stage.GUIDE colours)
    collision/<chunk>.collision.json  the game's collision format, from the same data
    previews/blockout.png           the whole zone's guides at 1/4 size

Scale and story rules (Alexander, 24 Oct: small hero, big quiet place, secret horror – never claustrophobic):
- the hero is 76 px, a ninth of a chunk; at pond level the ground sits low, so most of the frame is sky
- caves and cellars are rooms of at least three hero heights, warm lit pockets – no corridors
- the sky band has two or three long girder beams per chunk with wide gaps: negative space is the calm
- the band under the pond is the WRONG REFLECTION: a vast drained hall under a water surface that hangs overhead,
  its girders the sky girders mirrored upside down
- every move is sized to the hero (jump.ts: 96 px jump, designed to 80; a running gap of 120 px); the zone must be
  reachable and leavable from every surface, or the seed is rejected and the next one tried
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grow_stage import GUIDE  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
W, H = 2160, 720
HERO = 76
JUMP_UP = 80       # a held jump rises 96 px; designed with margin
GAP = 120          # widest gap a running jump clears, with margin
STEP = 48          # the most a walk line rises or falls at one step
SNAP = 24          # every height and x snaps to this grid
GROUND = (470, 560)    # pond level: the ground line, low in the frame
BEAM = (360, 540)      # sky band: girder beam heights
HIGH = (190, 280)      # sky band: the second, higher tier
FLOOR = (600, 648)     # the hall under the pond: its floor
CEILING = 150          # ... and the water surface hanging overhead
ROOM = (3 * HERO, 420)  # caves and cellars: at least three hero heights tall, this wide


def snap(v: float) -> int:
    return int(round(v / SNAP) * SNAP)


def cid(prefix: str, col: int, row: int) -> str:
    return f"{prefix}-{col}-{row}"


def band_of(row: int, rows: int) -> str:
    """Row 0 is the sky, the last row the hall under the pond, everything between pond level."""
    return "above" if row == 0 else "below" if row == rows - 1 else "level"


# ---- stage 0: the room graph ----------------------------------------------------------------------------------

def graph(cols: int, rows: int, rng: random.Random, loops: float = 0.3) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """Links between grid neighbours: pond level and the hall are open left to right; the sky beams and the shafts
    are a random spanning tree over what is left, plus a few loops."""
    forced, optional = [], []
    for r in range(rows):
        for c in range(cols):
            if c + 1 < cols:
                (forced if band_of(r, rows) != "above" else optional).append(((c, r), (c + 1, r)))
            if r + 1 < rows:
                optional.append(((c, r), (c, r + 1)))
    parent = {(c, r): (c, r) for c in range(cols) for r in range(rows)}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    links = []
    for a, b in forced:
        parent[find(a)] = find(b)
        links.append((a, b))
    rng.shuffle(optional)
    rest = []
    for a, b in optional:
        if find(a) != find(b):
            parent[find(a)] = find(b)
            links.append((a, b))
        else:
            rest.append((a, b))
    links += [e for e in rest if rng.random() < loops]
    return sorted(links)


# ---- stage 1: the blockout ------------------------------------------------------------------------------------

def terrain(left: int, right: int, keep: list[tuple[int, int]], lo: int, hi: int, rng: random.Random) -> list[list[int]]:
    """A walk line across the chunk as flat runs [x0, x1, y]: it starts at `left`, ends at `right`, is level over
    each `keep` span (x0, x1) at whatever height it has there, and steps at most STEP between runs."""
    xs = [0]
    while xs[-1] < W - 360:
        xs.append(min(W, snap(xs[-1] + rng.randint(420, 820))))
    xs = [x for x in xs if all(not (a - 60 < x < b + 60) for a, b in keep)] + [W]
    ys = [left]
    for _ in xs[1:-2]:
        ys.append(max(lo, min(hi, ys[-1] + rng.choice((-1, 0, 1)) * rng.choice((SNAP, STEP)))))
    ys.append(right) if len(xs) > 2 else None
    runs = [[xs[i], xs[i + 1], ys[min(i, len(ys) - 1)]] for i in range(len(xs) - 1)]
    for i in range(1, len(runs)):  # walk the last runs toward `right` in steps a jump can always climb
        need = runs[-1][2] - runs[i - 1][2]
        if abs(need) > STEP and i < len(runs) - 1:
            runs[i][2] = runs[i - 1][2] + (STEP if need > 0 else -STEP)
    runs = [r for r in runs if r[1] > r[0]]
    runs[0][2], runs[-1][2] = left, right
    if len(runs) > 1 and abs(runs[-1][2] - runs[-2][2]) > STEP:
        mid = (runs[-2][0] + runs[-2][1]) // 2
        runs.insert(-1, [mid, runs[-2][1], (runs[-1][2] + runs[-2][2]) // 2 // SNAP * SNAP])
        runs[-3][1] = mid
    return runs


def height_at(runs: list[list[int]], x: int) -> int:
    return next(y for x0, x1, y in runs if x0 <= x <= x1)


def level_chunk(c: dict, edges: dict, shafts: dict, rng: random.Random) -> None:
    """Pond level: low ground with hills, a deck across a pond, a cave in a hill, girder legs with ladders up."""
    up, down = shafts.get("up", []), shafts.get("down", [])
    keep = [(x - 90, x + 90) for x in up + down]
    pond = None
    for _ in range(20):
        w = snap(rng.randint(560, 900))
        x0 = snap(rng.randint(240, W - 240 - w))
        if all(x1 < x0 - 120 or x1 > x0 + w + 120 for x1 in up + down):
            pond = (x0, x0 + w)
            break
    runs = terrain(edges["left"], edges["right"], keep + ([pond] if pond else []), *GROUND, rng)
    c["walk"] = [[[x0, y], [x1, y]] for x0, x1, y in runs]
    c["ground"] = runs
    if pond:
        y = height_at(runs, (pond[0] + pond[1]) // 2)
        c["water"].append([pond[0], y + 30, pond[1], H])
        c["deck"].append([pond[0], pond[1], y])
    for x in up:  # a rusty girder leg out of the reeds, a ladder up it into the sky
        c["climb"].append([x - 16, 0, x + 16, height_at(runs, x)])
        c["structure"].append([x - 40, 0, x - 16, height_at(runs, x)])
        c["structure"].append([x + 16, 0, x + 40, height_at(runs, x)])
    for x in down:  # a shaft through the bank down into the hall
        y = height_at(runs, x)
        c["hollow"].append([x - 60, y, x + 60, H])
        c["climb"].append([x - 16, y, x + 16, H])
    free = [r for r in runs if r[1] - r[0] >= ROOM[1] + 100 and not any(r[0] < x < r[1] for x in up + down)
            and not (pond and r[0] < pond[1] and r[1] > pond[0])]
    if free:  # a cave in a hill: a mound of earth over a lit room you walk into on the same ground
        r = rng.choice(free)
        x0 = snap(rng.randint(r[0] + 50, r[1] - 50 - ROOM[1]))
        top = r[2] - ROOM[0] - 90
        c["mound"].append([x0 - 120, top, x0 + ROOM[1] + 120, r[2]])
        c["hollow"].append([x0, r[2] - ROOM[0], x0 + ROOM[1], r[2]])
        c["interact"].append({"id": f"{c['id']}-chest", "kind": "secret", "x": x0 + ROOM[1] - 110, "y": r[2] - 40,
                              "w": 60, "h": 40, "note": WORDS["notes"]["mound"]})
    rest = [r for r in runs if r[1] - r[0] >= 360 and not (pond and r[0] < pond[1] and r[1] > pond[0])]
    if rest:  # a bench to sit on: a place of rest
        r = rng.choice(rest)
        x = snap((r[0] + r[1]) / 2)
        c["interact"].append({"id": f"{c['id']}-bench", "kind": "rest", "x": x - 70, "y": r[2] - 50, "w": 140,
                              "h": 50, "note": WORDS["notes"]["rest"]})


def beams(edges: dict, shafts: dict, rng: random.Random) -> list[list[int]]:
    """The sky band's girder beams as [x0, x1, y]: two or three long beams with jumpable gaps between them, meeting
    a linked edge at its door height, stopping short of an unlinked one; every shaft ends on one."""
    left, right = edges.get("left"), edges.get("right")
    x, y = (0, left) if left is not None else (snap(rng.randint(200, 320)), snap(rng.randint(*BEAM)))
    out = []
    end = W if right is not None else W - snap(rng.randint(200, 320))
    while x < end:
        length = snap(rng.randint(560, 960))
        x1 = min(end, x + length)
        if end - x1 < 400:
            x1 = end
        if x1 == end and right is not None:
            y = right if abs(right - y) <= STEP or not out else y
        out.append([x, x1, y])
        if x1 >= end:
            break
        x = x1 + snap(rng.randint(48, GAP - 24))
        target = right if right is not None and end - x < 1100 else snap(rng.randint(*BEAM))
        y = max(BEAM[0], min(BEAM[1], y + max(-STEP, min(STEP, target - y))))
    if right is not None and out[-1][2] != right:  # the last beam meets the door: one more short beam, a step away
        x0 = out[-1][1] - 240
        out[-1][1] = x0 - 72
        out.append([x0, W, right])
    for s in shafts.get("down", []):
        if not any(b[0] + 30 <= s <= b[1] - 30 for b in out):
            near = min(out, key=lambda b: min(abs(b[0] - s), abs(b[1] - s)))
            near[0], near[1] = min(near[0], s - 120), max(near[1], s + 120)
    return out


def above_chunk(c: dict, edges: dict, shafts: dict, rng: random.Random) -> None:
    """The sky: long beams, a higher tier reached by a ladder, a glint at one beam's far end."""
    low = beams(edges, shafts, rng)
    c["beams"] = low
    for x0, x1, y in low:
        c["oneWay"].append([[x0, y], [x1, y]])
    for s in shafts.get("down", []):  # the ladder from pond level arrives on a beam
        b = next(b for b in low if b[0] + 30 <= s <= b[1] - 30)
        c["climb"].append([s - 16, b[2], s + 16, H])
        c["structure"] += [[s - 40, b[2], s - 16, H], [s + 16, b[2], s + 40, H]]
    wide = [b for b in low if b[1] - b[0] >= 600]
    if wide:
        b = rng.choice(wide)
        y = snap(rng.randint(*HIGH))
        x0 = snap(rng.randint(b[0] + 60, b[1] - 420))
        c["oneWay"].append([[x0, y], [x0 + 420, y]])
        c["beams"].append([x0, x0 + 420, y])
        lx = x0 + 60
        c["climb"].append([lx - 16, y, lx + 16, b[2]])
        c["interact"].append({"id": f"{c['id']}-glint", "kind": "secret", "x": x0 + 360, "y": y - 40, "w": 40, "h": 40,
                              "note": WORDS["notes"]["glint"]})
    for x0, x1, y in c["beams"]:
        c["structure"].append([x0, y, x1, y + 22])


def below_chunk(c: dict, edges: dict, shafts: dict, mirror: list[list[int]], rng: random.Random, outer: dict) -> None:
    """The wrong reflection: a drained hall under a hanging water surface, the sky beams mirrored, a lit cellar."""
    up = shafts.get("up", [])
    runs = terrain(edges["left"], edges["right"], [(x - 90, x + 90) for x in up], *FLOOR, rng)
    c["walk"] = [[[x0, y], [x1, y]] for x0, x1, y in runs]
    c["ground"] = runs
    c["water"].append([0, 0, W, CEILING])
    c["noGoCeiling"] = True
    for x0, x1, y in mirror:  # the sky beam at y hangs here at the mirrored height, with a ladder to the floor
        my = max(CEILING + 2 * HERO, min(height_at(runs, (x0 + x1) // 2) - 160, H - y + 60))
        my = snap(my)
        c["oneWay"].append([[x0, my], [x1, my]])
        c["structure"].append([x0, my, x1, my + 22])
        c["structure"].append([x0 + 40, CEILING, x0 + 64, my])  # hangers from the water surface
        lx = snap(rng.randint(x0 + 60, x1 - 60))
        if all(abs(lx - x) > 90 for x in up):
            c["climb"].append([lx - 16, my, lx + 16, height_at(runs, lx)])
    for x in up:  # the shaft comes down through the water surface in a girder column
        c["structure"] += [[x - 64, 0, x - 16, height_at(runs, x)], [x + 16, 0, x + 64, height_at(runs, x)]]
        c["climb"].append([x - 16, 0, x + 16, height_at(runs, x)])
    side = "left" if outer.get("left") else "right" if outer.get("right") else None
    if side:  # a warm cellar cut into the bank at the zone's edge: the refuge down here
        r = runs[0] if side == "left" else runs[-1]
        x0 = 60 if side == "left" else W - 60 - ROOM[1]
        c["hollow"].append([x0, r[2] - ROOM[0] - 40, x0 + ROOM[1], r[2]])
        c["interact"].append({"id": f"{c['id']}-lamp", "kind": "secret", "x": x0 + ROOM[1] // 2 - 30, "y": r[2] - 60,
                              "w": 60, "h": 60, "note": WORDS["notes"]["hollow"]})


# What the map calls its places, per zone: zone.json "words" overrides any of these (the Hidden Garden's are the
# default). Rusty Creek has no caves and no pond, so its zone names its own (#157).
WORDS = {
    "roles": {"above": "sky route", "level": "pond route", "below": "the wrong reflection"},
    "notes": {"mound": "a chest in the cave, under a lantern", "rest": "a park bench – sit, the music settles",
              "glint": "a glint at the high beam's end", "hollow": "a lit cellar: crates, shelves, a hanging lamp"},
    "brief": {
        "deck": "A timber deck on posts runs across still water where the guide shows it.",
        "mound": "A grassy hill rises where the guide's brown mound is; the purple room in it is a cave mouth with a "
                 "warm lantern and a small chest – a secret, cosy and lit.",
        "rest": "A wooden park bench stands on the path.",
        "hollow": "The purple room at the bank is a warm lit cellar with crates, shelves and a hanging lamp.",
        "above": "Grey beams are long rusty girders hanging in the open sky, vines and orange leaves on them; keep the "
                 "sky wide and calm – most of the image is sky."},
}


def words(zone: dict) -> dict:
    """The zone's names for its places: WORDS, with zone.json's "words" on top, key by key."""
    own = zone.get("words", {})
    return {part: {**WORDS[part], **own.get(part, {})} for part in WORDS}


def generate(zone: dict, seed: int, cols: int, rows: int) -> dict:
    """One candidate map for this seed (not yet checked)."""
    rng = random.Random(seed)
    prefix = zone.get("prefix", "".join(w[0] for w in zone["zone"].split("-")) + "z")
    links = graph(cols, rows, rng)
    door, shaft = {}, {}
    for a, b in links:
        band = band_of(a[1], rows)
        if a[1] == b[1]:
            door[(a, b)] = snap(rng.randint(*(GROUND if band == "level" else FLOOR if band == "below" else BEAM)))
        else:
            shaft[(a, b)] = snap(rng.randint(300, W - 300))
    chunks = {}
    for r in range(rows):
        for c in range(cols):
            band = band_of(r, rows)
            ch = {"id": cid(prefix, c, r), "col": c, "row": r, "band": band, "walk": [], "oneWay": [], "climb": [],
                  "water": [], "deck": [], "structure": [], "hollow": [], "mound": [], "interact": [], "ground": []}
            edges = {"left": door.get(((c - 1, r), (c, r))), "right": door.get(((c, r), (c + 1, r)))}
            for side in ("left", "right"):
                if edges[side] is None and band != "above":
                    edges[side] = snap(rng.randint(*(GROUND if band == "level" else FLOOR)))
            shafts = {"up": [x for (a, b), x in shaft.items() if b == (c, r)],
                      "down": [x for (a, b), x in shaft.items() if a == (c, r)]}
            sub = random.Random(rng.random())
            if band == "level":
                level_chunk(ch, edges, shafts, sub)
            elif band == "above":
                above_chunk(ch, {k: v for k, v in edges.items() if v is not None and
                                 door.get(((c - 1, r), (c, r)) if k == "left" else ((c, r), (c + 1, r))) is not None},
                            shafts, sub)
            else:
                mirror = [b for b in chunks[cid(prefix, c, 0)].get("beams", [])][:3] if rows > 2 else []
                below_chunk(ch, edges, shafts, mirror, sub, {"left": c == 0, "right": c == cols - 1})
            chunks[ch["id"]] = ch
    for c in range(cols):  # the zone's outer walls: earth banks at pond level and in the hall
        for r in range(rows):
            if band_of(r, rows) != "above":
                ch = chunks[cid(prefix, c, r)]
                if c == 0:
                    ch.setdefault("solid", []).append([0, 0, 24, H])
                if c == cols - 1:
                    ch.setdefault("solid", []).append([W - 24, 0, W, H])
    tears = []
    sky = [ch for ch in chunks.values() if ch["band"] == "above"]
    for i in range(zone.get("anomaly", {}).get("count", 0)):
        ch = rng.choice(sky)
        kind = rng.choice(("cut", "stretch")) if i else "cut"
        w, h = (snap(rng.randint(420, 760)), snap(rng.randint(120, 200))) if kind == "cut" else \
            (snap(rng.randint(160, 380)), snap(rng.randint(260, 460)))
        x0, y0 = snap(rng.randint(60, W - 60 - w)), snap(rng.randint(24, max(30, 300 - h // 2)))
        tear = {"kind": kind, "chunk": ch["id"], "box": [x0, y0, x0 + w, y0 + h], "seed": rng.randint(0, 9999)}
        if kind == "stretch":
            tear["from"] = y0 + h
        tears.append(tear)
    return {"zone": zone["zone"], "seed": seed, "chunk": [W, H], "grid": [cols, rows], "prefix": prefix,
            "chunks": chunks,
            "links": [{"a": cid(prefix, *a), "b": cid(prefix, *b), "by": "door" if a[1] == b[1] else "shaft",
                       "at": door.get((a, b), shaft.get((a, b)))} for a, b in links],
            "anomaly": {"tears": tears}}


# ---- reachability ---------------------------------------------------------------------------------------------

def surfaces(world: dict) -> list[dict]:
    """Every walk line and one-way beam in zone pixels: {x0, x1, y, oneWay}."""
    out = []
    for ch in world["chunks"].values():
        ox, oy = ch["col"] * W, ch["row"] * H
        for kind in ("walk", "oneWay"):
            for (x0, y0), (x1, _) in ch[kind]:
                out.append({"x0": ox + x0, "x1": ox + x1, "y": oy + y0, "oneWay": kind == "oneWay", "chunk": ch["id"]})
        for x0, x1, y in ch["deck"]:
            out.append({"x0": ox + x0, "x1": ox + x1, "y": oy + y, "oneWay": False, "chunk": ch["id"]})
    return out


def blocks(world: dict) -> list[tuple[int, int, int, int]]:
    """Solid boxes in zone pixels."""
    return [(ch["col"] * W + x0, ch["row"] * H + y0, ch["col"] * W + x1, ch["row"] * H + y1)
            for ch in world["chunks"].values() for x0, y0, x1, y1 in ch.get("solid", [])]


def ladders(world: dict) -> list[tuple[int, int, int, int]]:
    """Climb boxes in zone pixels, pieces that meet across a seam joined."""
    boxes = sorted((ch["col"] * W + x0, ch["row"] * H + y0, ch["col"] * W + x1, ch["row"] * H + y1)
                   for ch in world["chunks"].values() for x0, y0, x1, y1 in ch["climb"])
    out = []
    for b in boxes:
        prev = next((o for o in out if o[0] == b[0] and o[2] == b[2] and abs(o[3] - b[1]) <= 2), None)
        if prev:
            out[out.index(prev)] = (prev[0], prev[1], prev[2], b[3])
        else:
            out.append(b)
    return out


def edges_of(world: dict) -> dict[int, set[int]]:
    """Which surface the hero can get to from which: walk on, jump (up to JUMP_UP, across up to GAP), drop off an end
    or through a one-way beam, climb a ladder. Directed: a drop is one way."""
    s, walls, climbs = surfaces(world), blocks(world), ladders(world)
    out = {i: set() for i in range(len(s))}

    def walled(xa: int, xb: int, ya: int, yb: int) -> bool:
        lo, hi = min(xa, xb), max(xa, xb)
        top, bottom = min(ya, yb) - HERO - JUMP_UP, max(ya, yb)
        return any(x0 < hi and x1 > lo and y0 < bottom and y1 > top for x0, y0, x1, y1 in walls)

    def landing(x: int, y: int, skip: int) -> int | None:
        below = [j for j, t in enumerate(s) if j != skip and t["x0"] - 8 <= x <= t["x1"] + 8 and t["y"] > y]
        return min(below, key=lambda j: s[j]["y"]) if below else None

    for i, a in enumerate(s):
        for j, b in enumerate(s):
            if i == j:
                continue
            gap = max(b["x0"] - a["x1"], a["x0"] - b["x1"], 0)
            rise = a["y"] - b["y"]
            if gap <= 8 and abs(rise) <= 8:
                out[i].add(j)  # one floor
            elif gap <= GAP and rise <= JUMP_UP and not walled(*sorted((a["x1"], b["x0"]) if b["x0"] >= a["x1"] else
                                                                      (b["x1"], a["x0"])), a["y"], b["y"]) and \
                    (gap > 0 or b["oneWay"] or rise <= 0):
                out[i].add(j)  # a jump across, onto a ledge, or up through a beam
        for x in (a["x0"] - 10, a["x1"] + 10):  # walk off an end
            j = landing(x, a["y"], i)
            if j is not None and not walled(x, x, a["y"], s[j]["y"]):
                out[i].add(j)
        if a["oneWay"]:
            for x in range(a["x0"], a["x1"], 120):
                j = landing(x, a["y"], i)
                if j is not None:
                    out[i].add(j)
    for x0, y0, x1, y1 in climbs:
        on = [j for j, t in enumerate(s) if t["x0"] - 24 <= x1 and t["x1"] + 24 >= x0 and y0 - 12 <= t["y"] <= y1 + 12]
        for a in on:
            out[a].update(b for b in on if b != a)
    return out


def check(world: dict) -> list[str]:
    """Problems with this map: surfaces you can't reach from the start, or can't get back to the start from."""
    s = surfaces(world)
    if not s:
        return ["no surfaces"]
    graph_ = edges_of(world)
    start = min((i for i, t in enumerate(s) if world["chunks"][t["chunk"]]["band"] == "level"),
                key=lambda i: (s[i]["x0"], s[i]["y"]))

    def reach(g: dict[int, set[int]]) -> set[int]:
        seen, todo = {start}, [start]
        while todo:
            for j in g[todo.pop()]:
                if j not in seen:
                    seen.add(j)
                    todo.append(j)
        return seen

    back = {i: set() for i in graph_}
    for i, js in graph_.items():
        for j in js:
            back[j].add(i)
    there, home = reach(graph_), reach(back)
    problems = [f"{t['chunk']} {'beam' if t['oneWay'] else 'walk'} x {t['x0']}-{t['x1']} y {t['y']}: "
                f"{'unreachable' if i not in there else 'no way back'}"
                for i, t in enumerate(s) if i not in there or i not in home]
    return problems


# ---- outputs --------------------------------------------------------------------------------------------------

def guide(ch: dict) -> Image.Image:
    """The chunk's flat layout guide in grow_stage.GUIDE colours."""
    band = ch["band"]
    img = Image.new("RGB", (W, H), GUIDE["sky"])
    d = ImageDraw.Draw(img)
    if band in ("level", "below"):
        for x0, x1, y in ch["ground"]:
            d.rectangle((x0, y, x1, H), fill=GUIDE["ground"])
    if band == "below":
        d.rectangle((0, 0, W, CEILING), fill=GUIDE["water"])
    for x0, y0, x1, y1 in ch["mound"]:
        d.rounded_rectangle((x0, y0, x1, y1), radius=60, fill=GUIDE["ground"])
    for x0, y0, x1, y1 in ch["water"]:
        d.rectangle((x0, y0, x1, y1), fill=GUIDE["water"])
    for x0, y0, x1, y1 in ch["hollow"]:
        d.rectangle((x0, y0, x1, y1), fill=GUIDE["hollow"])
    for x0, y0, x1, y1 in ch["structure"]:
        d.rectangle((x0, y0, x1, y1), fill=GUIDE["structure"])
    for x0, x1, y in ch["deck"]:
        d.rectangle((x0, y, x1, y + 16), fill=GUIDE["structure"])
        for px in range(x0 + 40, x1, 160):
            d.rectangle((px, y, px + 12, H), fill=GUIDE["structure"])
    for x0, y0, x1, y1 in ch["climb"]:
        d.rectangle((x0, y0, x1, y1), fill=GUIDE["ladder"])
    for x0, y0, x1, y1 in ch.get("solid", []):
        d.rectangle((x0, y0, x1, y1), fill=GUIDE["ground"])
    for kind in ("walk", "oneWay"):
        for line in ch[kind]:
            d.line([tuple(p) for p in line], fill=GUIDE["walk"], width=6)
    for x0, x1, y in ch["deck"]:
        d.line([(x0, y), (x1, y)], fill=GUIDE["walk"], width=6)
    return img


def collision(ch: dict) -> dict:
    """The chunk in the game's collision format (docs/13), from the blockout data."""
    box = lambda b, **k: {"x": b[0], "y": b[1], "w": b[2] - b[0], "h": b[3] - b[1], **k}  # noqa: E731
    walk = ch["walk"] + [[[x0, y], [x1, y]] for x0, x1, y in ch["deck"]]
    water = [box(b, kind="water", note="water: never floor") for b in ch["water"]]
    return {"chunk": ch["id"], "state": "anomaly", "size": [W, H], "walk": sorted(walk), "slide": [],
            "oneWay": ch["oneWay"], "climb": [box(b, kind="ladder") for b in ch["climb"]],
            "solid": [box(b, kind="wall") for b in ch.get("solid", [])], "noGo": water, "hazard": [],
            "interact": ch["interact"]}


def brief(ch: dict, zone: dict) -> str:
    """What the paint stage tells the model this chunk is: the band's vocabulary and what the guide holds."""
    say = words(zone)["brief"]
    parts = [zone["vocabulary"][ch["band"]].capitalize() + "."]
    if ch["deck"]:
        parts.append(say["deck"])
    if ch["mound"]:
        parts.append(say["mound"])
    if any(i["kind"] == "rest" for i in ch["interact"]):
        parts.append(say["rest"])
    if ch["band"] == "below" and ch["hollow"]:
        parts.append(say["hollow"])
    if ch["band"] == "above":
        parts.append(say["above"])
    return " ".join(p for p in parts if p)


def build(zone_dir: Path, seed: int | None = None, grid: tuple[int, int] | None = None, tries: int = 50) -> dict:
    """Generate, check, and write the zone; returns world.json's content."""
    zone = json.loads((zone_dir / "zone.json").read_text(encoding="utf-8"))
    cols, rows = grid or tuple(zone["grid"])
    seed = zone["seed"] if seed is None else seed
    for attempt in range(tries):
        world = generate(zone, seed + attempt, cols, rows)
        problems = check(world)
        if not problems:
            break
        print(f"seed {seed + attempt}: rejected ({len(problems)} problems, e.g. {problems[0]})")
    else:
        sys.exit(f"no playable map in {tries} seeds from {seed}")
    for ch in world["chunks"].values():
        ch["brief"] = brief(ch, zone)
        ch["role"] = words(zone)["roles"][ch["band"]]
        own = {WORDS["notes"][k]: v for k, v in words(zone)["notes"].items()}
        for item in ch["interact"]:
            item["note"] = own.get(item.get("note"), item.get("note"))
    for sub in ("blockout", "collision", "previews"):
        (zone_dir / sub).mkdir(exist_ok=True)
    sheet = Image.new("RGB", (cols * W // 4, rows * H // 4))
    for ch in world["chunks"].values():
        img = guide(ch)
        img.save(zone_dir / "blockout" / f"{ch['id']}.png")
        sheet.paste(img.resize((W // 4, H // 4), Image.NEAREST), (ch["col"] * W // 4, ch["row"] * H // 4))
        (zone_dir / "collision" / f"{ch['id']}.collision.json").write_text(
            json.dumps(collision(ch), indent=1) + "\n", encoding="utf-8")
    sheet.save(zone_dir / "previews" / "blockout.png")
    keep = ("id", "col", "row", "band", "role", "brief", "interact")
    out = {**world, "chunks": {k: {f: v[f] for f in keep} for k, v in world["chunks"].items()},
           "beats": [{"chunk": i["id"].rsplit("-", 1)[0], "kind": i["kind"], "note": i["note"]}
                     for ch in world["chunks"].values() for i in ch["interact"]]}
    (zone_dir / "world.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    s = surfaces(world)
    print(f"{zone['zone']}: seed {world['seed']}, {cols}x{rows} chunks, {len(s)} surfaces, "
          f"{len(ladders(world))} ladders, {len(out['beats'])} beats, {len(world['anomaly']['tears'])} tears – "
          "every surface reachable and leavable")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("zone", type=Path)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--grid", help="COLSxROWS, e.g. 3x3")
    args = parser.parse_args()
    zone = args.zone if args.zone.is_absolute() else ROOT / args.zone
    build(zone, args.seed, tuple(int(v) for v in args.grid.split("x")) if args.grid else None)


if __name__ == "__main__":
    main()
