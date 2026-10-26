"""Rusty Creek as a zone (#157, docs/09 "World pipeline"): 3 x 3 chunks grown from one start chunk cut 1:1 from the
#227 concept's level band – the rust maze above, the creek path, the drains below. Writes every chunk's collision,
re-traces the band above's blockout from its painting, and checks that the whole grid can be walked both ways.

    python scripts/zones/rusty_creek_zone.py           # collision, blockout, reachability
    python scripts/zones/rusty_creek_zone.py --stage   # the zone becomes the game's Rusty Creek (art/stages/rusty-creek)
    python scripts/zones/rusty_creek_zone.py --fills   # after depth_layers fill/whole: the back layers whole

The level row's collision is measured from the art (the concept's path and the railway girder are straight); the
band above and the band below are traced from their depth keys (depth_layers.py key / masks --all), with the same
rules as the Hidden Garden's underground (hidden_garden_proof.py). The band above is the rust maze Alexander kept
over its two-beam map (25 Oct): its blockout is redrawn from the traced floors and ladders, so the artifact gate's
route check measures the painting against what is walked.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import hidden_garden_proof as hg  # noqa: E402
import world_map as wm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ZONE = ROOT / "art" / "zones" / "rusty-creek"
W, H = 2160, 720
BODY = 76
PATH = 522      # the cement creek path behind the railing (the concept's level band, 1:1)
WATER = 600     # the creek's surface: no-go below
# The pier ladders painted into the level row (feature windows, 25 Oct): x0, x1 per chunk.
PIER_LADDERS = {0: (330, 372), 1: (1062, 1106), 2: (1706, 1756)}
CULVERT = (340, 470)  # rcz-2-1: the lit culvert mouth in the bank – the way down into the drains
# Measured where the tracer can't read the art: rcz-1-2's catwalk end and the steel stair painted down from it to the
# stone ledge by the outfall (a feature window, 25 Oct), so the drains can be walked back from rcz-2-2. From x on,
# the traced floors are replaced by this line (the tracer broke the deck wherever a pillar stands in front of it).
MEASURED = {"rcz-1-2": (0, [[0, 197], [1960, 197], [2050, 270], [2160, 278]])}  # pillars stand in front of the deck


# The railway girder's top flange per level chunk, measured on the sky/girder edge before the maze's posts and the
# tree line were carried down onto it (25 Oct): the girder is straight, the chunks differ by a few px.
GIRDER_TOP = {"rcz-0-1": 62, "rcz-1-1": 63, "rcz-2-1": 65}


def girder_top(cid: str) -> int:
    return GIRDER_TOP[cid]


def empty(cid: str) -> dict:
    return {"chunk": cid, "state": "clean", "size": [W, H], "walk": [], "slide": [], "oneWay": [], "climb": [],
            "solid": [], "noGo": [], "hazard": [], "interact": [], "spawn": []}


def level(col: int) -> dict:
    """The creek path, the railway girder's deck (its maintenance walk) and a ladder up each pier between them."""
    cid = f"rcz-{col}-1"
    data, top = empty(cid), girder_top(cid)
    data["walk"] = [[[0, PATH], [W, PATH]], [[0, top], [W, top]]]
    x0, x1 = PIER_LADDERS[col]
    data["climb"] = [hg.box(x0, top - 8, x1, PATH, kind="ladder", id=f"{cid}-pier-ladder")]
    data["noGo"] = [hg.box(0, WATER, W, H, kind="water")]
    if col == 2:
        data["interact"].append(hg.box(CULVERT[0], PATH - BODY, CULVERT[1], PATH, kind="door", id="culvert",
                                       to="drain-door", note="The lit culvert mouth in the bank: down into the drains."))
    return data


def simplify(line: list[list[int]], tolerance: float) -> list[list[int]]:
    """Ramer-Douglas-Peucker: the fewest points whose straight runs stay within `tolerance` px of the line."""
    if len(line) <= 2:
        return line
    (x0, y0), (x1, y1) = line[0], line[-1]
    def off(p):
        return abs((y1 - y0) * p[0] - (x1 - x0) * p[1] + x1 * y0 - y1 * x0) / max(1e-9, ((y1 - y0) ** 2 + (x1 - x0) ** 2) ** 0.5)
    i, worst = max(((i, off(p)) for i, p in enumerate(line[1:-1], 1)), key=lambda t: t[1])
    if worst <= tolerance:
        return [line[0], line[-1]]
    return simplify(line[:i + 1], tolerance)[:-1] + simplify(line[i:], tolerance)


def traced(cid: str, row: int) -> dict:
    """A grown band's floors and ladders from its depth key (stage 7)."""
    data, bands = empty(cid), hg.key_bands(cid, ZONE)
    if bands is None:
        raise SystemExit(f"{cid}: no depth key – run depth_layers.py key art/zones/rusty-creek {cid}")
    steps = hg.ladders(bands)
    lines = hg.headroom(hg.floors(bands, steps, 0 if row == 0 else 24))
    # a ladder that reaches the band's bottom edge (above) or top edge (below) goes on into the next row
    data["climb"] = [hg.box(x0, 0 if row == 2 and top < 40 else top, x1, H if row == 0 and bottom > H - 40 else bottom,
                            kind="ladder", id=f"{cid}-ladder-{n}") for n, (x0, x1, top, bottom) in enumerate(steps)]
    data["walk"] = hg.walkable(cid, lines, data["climb"], ZONE)
    if row == 2:  # the drains are flooded at the bottom: the water there is no-go (you're put back on the last floor)
        wet = (bands == "water").mean(1) > 0.5
        y = H
        while y > 0 and wet[y - 1]:
            y -= 1
        if y < H:
            data["noGo"] = [hg.box(0, y, W, H, kind="water")]
    if cid in MEASURED:
        x, line = MEASURED[cid]
        data["walk"] = [l for l in data["walk"] if l[0][0] < x] + [line]
        data["walk"] = [[p for p in l if p[0] <= x] if l is not data["walk"][-1] else l for l in data["walk"]]
        data["walk"] = [l for l in data["walk"] if len(l) > 1]
    # A floor run on to the chunk's edge (walkable) can end in a 4 px piece the body steps over in one frame: a point
    # that close to an end goes, the end stays.
    data["walk"] = [[p for i, p in enumerate(line) if i in (0, len(line) - 1)
                     or (p[0] - line[0][0] >= 8 and line[-1][0] - p[0] >= 8)] for line in data["walk"]]
    if row == 0:  # a floor at the frame's top has no room over it for the body (the row above is not there)
        data["walk"] = [l for l in data["walk"] if min(y for _, y in l) >= BODY + 14]
        # A girder is straight: each traced beam is one flat tread at its median height (collision_check: planks
        # are flat; the trace wobbles 1-3 px along the rivets).
        data["walk"] = [[[line[0][0], med], [line[-1][0], med]] for line in data["walk"]
                        for med in [sorted(p[1] for p in line)[len(line) // 2]]]
    # The key marks pillars and pipes with brick rows or brackets like rungs: a climb is a ladder between the floors
    # it crosses, trimmed to them; only a maze ladder runs on down past its chunk's bottom (onto the girder deck).
    climbs = []
    for c in data["climb"]:
        mid = c["x"] + c["w"] / 2
        ys = sorted({round(a[1] + (b[1] - a[1]) * (mid - a[0]) / max(1, b[0] - a[0]))
                     for line in data["walk"] for a, b in zip(line, line[1:]) if a[0] <= mid <= b[0]})
        ys = [y for y in ys if c["y"] - 32 <= y <= c["y"] + c["h"] + 32]
        bottom = H if row == 0 and c["y"] + c["h"] > H - 40 else (ys[-1] if ys else None)
        if ys and bottom is not None and bottom - ys[0] >= 48:
            climbs.append({**c, "y": ys[0], "h": bottom - ys[0]})
    data["climb"] = climbs
    return data


def drain_door(data: dict) -> None:
    """rcz-2-2: the door under the culvert, on the floor nearest the top there."""
    x = sum(CULVERT) // 2
    y = hg.floor_at(data["walk"], x, "top")
    data["interact"].append(hg.box(CULVERT[0], y - BODY, CULVERT[1], y, kind="door", id="drain-door", to="culvert",
                                   note="Back up through the culvert to the creek path."))


def graph(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> dict:
    """The collision files as world_map reads a world. A door pair is a ladder between the doors' floors (the culvert
    sits straight over the drain door): the upper door's box runs down to its chunk's bottom, the lower one's up
    from its chunk's top, so world_map joins them across the seam."""
    chunks = {}
    for cid, data in collisions.items():
        col, row = grid[cid]
        climb = [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["climb"]]
        for door in (b for b in data["interact"] if b.get("kind") == "door"):
            climb.append([door["x"], door["y"], door["x"] + door["w"], H] if door["id"] == "culvert" else
                         [door["x"], 0, door["x"] + door["w"], door["y"] + door["h"]])
        if row == 1:  # the girder deck meets the ladders of the maze standing on it
            top = data["walk"][1][0][1]
            for other, (c, r) in grid.items():
                if c == col and r == 0:
                    climb += [[b["x"], 0, b["x"] + b["w"], top] for b in collisions[other]["climb"]
                              if b["y"] + b["h"] >= H - 2]
        chunks[cid] = {"id": cid, "col": col, "row": row, "band": "level" if row == 1 else "other",
                       "walk": [[a, b] for line in data["walk"] for a, b in zip(line, line[1:])],
                       "oneWay": data["oneWay"], "deck": [], "climb": climb,
                       "solid": [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["solid"]]}
    return {"chunks": chunks}


def reachable_only(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> int:
    """Drop traced walk segments nobody can reach or leave (a beam high in the maze with no ladder to it is
    scenery). The level row is measured, never dropped. Returns how many segments went."""
    bad = {(p.split()[0], int(p.split()[3].split("-")[0]), int(p.split()[5].rstrip(":")))
           for p in wm.check(graph(collisions, grid)) if p.split()[1] == "walk"}
    gone = 0
    for cid, data in collisions.items():
        if grid[cid][1] == 1:
            continue
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


def blockout(data: dict) -> Image.Image:
    """The band above's guide redrawn from its traced floors and ladders (world_map.guide's colours)."""
    ch = {"band": "above", "ground": [], "mound": [], "water": [], "hollow": [], "structure": [], "deck": [],
          "climb": [[b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]] for b in data["climb"]],
          "walk": data["walk"], "oneWay": data["oneWay"]}
    return wm.guide(ch)


STAGE = ROOT / "art" / "stages" / "rusty-creek"
# Zone band -> stage layer. Every layer scrolls with the path (1.0): per-chunk plates at a slower scroll would slide
# against their neighbours (docs/09); parallax comes back with region plates quilted per row, a later step.
MASKS = (("00-sky", "00-sky"), ("01-far", "01-far"), ("02-mid", "02-mid"), ("04-water", "04-water"),
         ("05-play", "05-play"), ("07-foreground", "07-foreground"))
LAYERS = {"00-sky": 0, "01-far": 1, "02-mid": 2, "03-rear": 3, "04-water": 4, "05-play": 5, "07-foreground": 7}
MATERIAL = {0: "steel", 1: "stone", 2: "stone"}     # the maze's girders, the creek path, the drains' concrete

# The region's two states on the same art (Alexander, 26 Oct: the zone replaces the creek stage; the anomaly is the
# same picture with the 404 tears). Clean: you land on the path, Jenny comes down it and rams you (the jenny-ram box;
# Dexter watches from beyond it). Anomaly: the rust maze's fight, carried over from the old stage onto the zone's
# floors - the chair first, rovers on the path, the maze and the drains, the drone over the path, the crab on a maze
# beam, the coffee machine with Dexter, snacks and notes off the path, and Jenny's arena on the right-hand chunk,
# its platforms hung on chains from the railway girder.
CLEAN = {
    "rc-0-1": {"spawn": [{"id": "player", "kind": "player", "x": 300, "y": PATH,
                          "note": "The 404 lands the hero on the creek path under the rail bridge (P5)"}]},
    "rc-1-1": {"interact": [{"id": "jenny-ram", "kind": "jenny-ram", "x": 1080, "y": PATH - 92, "w": 40, "h": 92,
                             "note": "Jenny comes down the creek path and rams the hero; the region turns (M4-S1 #54, P5)"}]},
}
ARENA_GATE = 1096   # rc-2-1: the boss gate's x; her floor ends at ARENA_END, behind it the pier ladder and the exit
ARENA_END = 1690
PLATFORM_W = 202
PLATFORMS = [(1180, PATH - 87), (1430, PATH - 87)]   # left edge, top: 87 px over her floor (a full jump is 96)
ANOMALY = {
    "rc-0-1": {"spawn": [{"id": "player", "kind": "player", "x": 200, "y": PATH},
                         {"id": "rover-1", "kind": "rover", "x": 900, "y": PATH, "patrol": [780, 1020]},
                         {"id": "rover-4", "kind": "rover", "x": 1500, "y": PATH, "patrol": [1380, 1620]}],
               "interact": [{"id": "chair", "kind": "pickup", "item": "chair", "x": 520, "y": PATH - 36, "w": 40, "h": 36},
                            {"id": "note-1", "kind": "pickup", "item": "note-1", "x": 1200, "y": 62 - 24, "w": 24, "h": 24}]},
    "rc-0-0": {"spawn": [{"id": "rover-5", "kind": "rover", "x": 1800, "y": 287, "patrol": [1560, 2040]},
                         {"id": "rover-6", "kind": "rover", "x": 450, "y": 524, "patrol": [220, 700]}],
               "interact": [{"id": "muffin-1", "kind": "pickup", "item": "muffin", "x": 1500, "y": 287 - 28, "w": 24, "h": 28}]},
    "rc-1-1": {"spawn": [{"id": "rover-2", "kind": "rover", "x": 500, "y": PATH, "patrol": [360, 640]},
                         {"id": "rover-3", "kind": "rover", "x": 1350, "y": PATH, "patrol": [1220, 1480]},
                         {"id": "drone-1", "kind": "drone", "x": 1150, "y": PATH - 95, "patrol": [900, 1500]},
                         {"id": "dexter-1", "kind": "dexter", "x": 1820, "y": PATH}],
               "interact": [{"id": "coffee-1", "kind": "coffee-machine", "x": 1770, "y": PATH - 80, "w": 40, "h": 80},
                            {"id": "leberkaese-1", "kind": "pickup", "item": "leberkaese", "x": 1400, "y": 63 - 28, "w": 24, "h": 28}]},
    "rc-1-0": {"spawn": [{"id": "crab-1", "kind": "crab", "x": 1200, "y": 536, "patrol": [950, 1530]}]},
    "rc-2-2": {"spawn": [{"id": "rover-7", "kind": "rover", "x": 1300, "y": 221, "patrol": [1000, 1700]}],
               "interact": [{"id": "note-2", "kind": "pickup", "item": "note-2", "x": 1900, "y": 221 - 24, "w": 24, "h": 24}]},
    "rc-2-1": {"spawn": [{"id": "jenny", "kind": "jenny", "x": 1440, "y": PATH},
                         {"id": "dexter-2", "kind": "dexter", "x": 1640, "y": PATH}],
               "interact": [{"id": "boss-gate", "kind": "boss-gate", "x": ARENA_GATE, "y": PATH - 100, "w": 30, "h": 100},
                            {"id": "exit-anomaly", "kind": "chunk-exit", "x": 2060, "y": PATH - 80, "w": 60, "h": 80}]},
}


def looks_like_sky(rgb):
    """Blue sky or a white cloud (the creek's morning sky): what the sky layer may own."""
    import numpy as np
    r, g, b = (np.asarray(rgb)[..., i].astype(int) for i in range(3))
    return ((b > r + 15) & (b > 120)) | (np.minimum(np.minimum(r, g), b) > 170)


def sky_mask(mask: Path, image: Path) -> Image.Image:
    """The depth key's sky without the girder edges, ladders and leaves it let through (they go to the back wall)."""
    import numpy as np
    alpha = np.asarray(Image.open(mask).getchannel("A")) > 128
    keep = alpha & looks_like_sky(Image.open(image).convert("RGB"))
    out = np.zeros((*keep.shape, 4), np.uint8)
    out[keep] = 255
    return Image.fromarray(out)


def stage_id(zid: str) -> str:
    return "rc-" + zid.split("-", 1)[1]


def copy(value):
    return json.loads(json.dumps(value))


def stage_collision(data: dict, sid: str, state: str, row: int) -> dict:
    """A zone chunk's collision as the stage's: typed terrain, the state's spawns and finds."""
    out = copy(data)
    out.update({"chunk": sid, "state": state, "ledge": [], "glideLift": [], "spawn": [],
                "interact": [i for i in data["interact"] if i.get("kind") == "door"]})
    extra = (CLEAN if state == "clean" else ANOMALY).get(sid, {})
    out["spawn"] += copy(extra.get("spawn", []))
    out["interact"] += copy(extra.get("interact", []))
    if state == "anomaly" and sid == "rc-2-1":
        # Jenny's floor is the path from the gate to ARENA_END (arenaFrom reads its end); past it the path goes on.
        out["walk"] = [[[0, PATH], [ARENA_END, PATH]], [[ARENA_END, PATH], [W, PATH]]] + \
            [line for line in out["walk"] if line[0][1] != PATH]
        out["oneWay"] += [[[x, top], [x + PLATFORM_W, top]] for x, top in PLATFORMS]
    out["terrain"] = []
    for line in out["oneWay"]:
        out["terrain"].append({"x": [line[0][0], line[-1][0]], "y": [line[0][1] - 12, line[0][1] + 12],
                               "kind": "plank", "material": "steel", "note": "an arena platform on its chains"})
    for line in out["walk"]:
        ys = [y for _, y in line]
        deck = row == 1 and max(ys) < 100
        steel = row == 0 or deck
        note = "a girder of the rust maze" if row == 0 else "the railway girder's deck" if deck \
            else "the creek path" if row == 1 else "the drains' floor"
        out["terrain"].append({"x": [line[0][0], line[-1][0]], "y": [min(ys) - 12, max(ys) + 12],
                               "kind": "plank" if steel else "ground", "material": "steel" if steel else MATERIAL[row],
                               "note": note})
    return out


def stage_ladders(collisions: dict[str, dict], grid: dict[str, tuple[int, int]]) -> None:
    """A maze ladder reaching its chunk's bottom goes on down to the girder deck in the chunk below."""
    for cid, (col, row) in grid.items():
        if row != 0:
            continue
        below = collisions[f"rcz-{col}-1"]
        top = girder_top(f"rcz-{col}-1")
        for n, c in enumerate(collisions[cid]["climb"]):
            if c["y"] + c["h"] >= H and not any(b["x"] == c["x"] and b["y"] == 0 for b in below["climb"]):
                below["climb"].append(hg.box(c["x"], 0, c["x"] + c["w"], top, kind="ladder", id=f"{cid}-ladder-{n}-on"))


def tears_plate(image: Path, tears: list[dict]):
    """The chunk's 404 tears as one RGBA plate over its clean picture (world_preview.tear_overlay), or None."""
    import numpy as np
    import world_preview as wp
    if not tears:
        return None
    clean = np.asarray(Image.open(image).convert("RGB"))
    plate = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for tear in tears:
        x0, y0, x1, y1 = wp.tear_region(tear)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.paste(Image.fromarray(wp.tear_overlay(clean[y0:y1, x0:x1], tear, x0, y0)), (x0, y0))
        plate = Image.alpha_composite(plate, layer)
    return plate


def export_stage(collisions: dict[str, dict], grid: dict[str, tuple[int, int]], world: dict) -> None:
    """The zone into art/stages/rusty-creek: paintings, masks (layers.json rules), export.json, both states'
    collision and the tears. Then: arena_platforms.py, split_layers.py, export_stage.py, collision_check.py."""
    import shutil
    for folder in ("images", "masks", "layers", "tears", "arena"):
        (STAGE / folder).mkdir(parents=True, exist_ok=True)
    stage_ladders(collisions, grid)
    layers = {"note": "Rusty Creek from its zone (art/zones/rusty-creek, scripts/zones/rusty_creek_zone.py --stage).",
              "chunks": {}}
    export = {"note": ("Rusty Creek as a 3 x 3 zone (#157): the rust maze, the creek path, the drains. Every layer "
                       "scrolls with the path; the anomaly is the same picture with the 404 tears (05-tears) and "
                       "Jenny's arena platforms (05-arena, an overlay on rc-2-1)."),
              "chunks": {}, "layers": {}, "states": {}, "composed": {"clean": "images/{name}.png"}}
    for lid, z in LAYERS.items():
        export["layers"][lid] = {"file": f"layers/{{name}}.{lid}.png", "z": z, "scroll": 1.0, "optional": lid != "03-rear"}
    export["layers"]["05-tears"] = {"file": "tears/{name}.png", "z": 5, "scroll": 1.0, "optional": True}
    export["layers"]["05-arena"] = {"file": "arena/{name}.png", "z": 5, "scroll": 1.0, "optional": True, "overlay": True,
                                    "why": "Jenny's arena platforms (playtest J6), on chains from the railway girder"}
    order = list(LAYERS)
    play = order.index("05-play") + 1
    export["states"] = {"clean": order, "anomaly": order[:play] + ["05-tears", "05-arena"] + order[play:]}
    tears = world["anomaly"]["tears"]
    for zid, (col, row) in grid.items():
        sid = stage_id(zid)
        shutil.copy(ZONE / "images" / f"{zid}.png", STAGE / "images" / f"{sid}.png")
        rules = []
        for band, layer in MASKS:
            mask = ZONE / "masks" / f"{zid}.{band}.png"
            if mask.exists() and band == "00-sky":
                sky_mask(mask, ZONE / "images" / f"{zid}.png").save(STAGE / "masks" / f"{sid}.{layer}.png", optimize=True)
                rules.append({"layer": layer, "alpha": f"masks/{sid}.{layer}.png"})
            elif mask.exists():
                shutil.copy(mask, STAGE / "masks" / f"{sid}.{layer}.png")
                rules.append({"layer": layer, "alpha": f"masks/{sid}.{layer}.png"})
        layers["chunks"][sid] = {"states": {"clean": f"images/{sid}.png"}, "default": "03-rear", "rules": rules}
        export["chunks"][sid] = {"x": col, "y": row}
        for state in ("clean", "anomaly"):
            data = stage_collision(collisions[zid], sid, state, row)
            (STAGE / f"{sid}.{state}.collision.json").write_text(
                json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        plate = tears_plate(STAGE / "images" / f"{sid}.png", [t for t in tears if t["chunk"] == zid])
        if plate is not None:
            plate.save(STAGE / "tears" / f"{sid}.png", optimize=True)
    for path, data in ((STAGE / "layers.json", layers), (STAGE / "export.json", export)):
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"rusty-creek stage: {len(grid)} chunks from the zone, both states, {len(tears)} tears")


def stage_fills(grid: dict[str, tuple[int, int]]) -> None:
    """Every chunk's back layer whole (docs/09, checked on purple): the sky of the two rows that have one, painted
    behind everything in front of it (depth_layers.py fill --only sky, its plate in tmp/), as fills/<chunk>.00-sky.png;
    the drains' back wall (depth_layers.py whole) down to the waterline only - below it the water layer covers the
    room, and the model painted the wall there as flat black (the made-up void docs/09 rejects)."""
    import numpy as np
    filled = ROOT / "tmp" / "boards" / "rusty-creek" / "filled"
    # The sky's colour per row, from the sky the maze's three chunks show (its mask): behind the maze the model's fill
    # came back as black girder silhouettes twice (60 % of each chunk masked), so there the sky is this gradient.
    skies = {}
    for zid, (_, row) in grid.items():
        sid = stage_id(zid)
        mask = STAGE / "masks" / f"{sid}.00-sky.png"
        if row < 2 and mask.exists():
            rgb = np.asarray(Image.open(STAGE / "images" / f"{sid}.png").convert("RGB"))
            r, g, b = (rgb[..., i].astype(int) for i in range(3))
            # the mask lets girder edges, ladders and tree tops through: only what looks like sky (blue, or a white
            # cloud) is kept as the sky's own; the rest is filled like the hidden sky
            looks = ((b > r + 15) & (b > 120)) | (np.minimum(np.minimum(r, g), b) > 170)
            skies[sid] = (rgb, (np.asarray(Image.open(mask).getchannel("A")) > 128) & looks)
    gradient = {}
    for row in (0, 1):
        rows = [v for s, v in skies.items() if s.endswith(f"-{row}")]
        rgb = np.concatenate([r for r, _ in rows], 1).astype(float)
        own = np.concatenate([o for _, o in rows], 1)
        line = np.array([np.median(rgb[y][own[y]], 0) if own[y].sum() > 20 else [np.nan] * 3 for y in range(H)])
        for ch in range(3):  # rows with too little sky take the nearest rows' colour
            good = ~np.isnan(line[:, ch])
            line[:, ch] = np.interp(np.arange(H), np.flatnonzero(good), line[good, ch])
        gradient[row] = line
    for zid, (_, row) in grid.items():
        sid = stage_id(zid)
        if row < 2 and sid in skies:
            rgb, own = skies[sid]
            base = np.repeat(gradient[row][:, None, :], W, 1)
            painted = filled / f"{sid}.00-sky.filled.png"
            if row == 1 and painted.exists():  # the path's sky came back whole: keep it, but not its dark specks
                base_img = np.asarray(Image.open(painted).convert("RGB")).astype(float)
                dark = base_img.max(2) < 110
                base = np.where(dark[..., None], base, base_img)
            # the fill is only what the sky does not own (split_layers puts it under the nearer layers)
            plate = np.dstack([np.where(own[..., None], rgb, base).clip(0, 255).astype(np.uint8),
                               np.where(own, 0, 255).astype(np.uint8)])
            Image.fromarray(plate).save(STAGE / "fills" / f"{sid}.00-sky.png", optimize=True)
            continue
        rear = STAGE / "fills" / f"{sid}.03-rear.png"
        water = json.loads((STAGE / f"{sid}.clean.collision.json").read_text(encoding="utf-8"))["noGo"]
        if rear.exists() and water:
            pixels = np.array(Image.open(rear).convert("RGBA"))
            pixels[min(b["y"] for b in water):, :, 3] = 0
            Image.fromarray(pixels).save(rear, optimize=True)
    print("rusty-creek fills: sky behind the maze and the path, the drains' walls down to the water")


def from_stage(grid: dict[str, tuple[int, int]], drop: bool = False) -> None:
    """Once exported, the stage holds the one committed copy of the zone's paintings and masks (check_docs: no
    duplicates); on a fresh checkout the zone's working copies come back from it. `drop`: after the export, remove the
    zone's copies."""
    import shutil
    for zid in grid:
        sid = stage_id(zid)
        pairs = [(STAGE / "images" / f"{sid}.png", ZONE / "images" / f"{zid}.png")]
        pairs += [(STAGE / "masks" / f"{sid}.{layer}.png", ZONE / "masks" / f"{zid}.{band}.png") for band, layer in MASKS]
        for stage, zone in pairs:
            if drop and stage.exists() and zone.exists():
                zone.unlink()
            elif not drop and stage.exists() and not zone.exists():
                zone.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(stage, zone)


def main() -> None:
    if "--fills" in sys.argv:
        world = json.loads((ZONE / "world.json").read_text(encoding="utf-8"))
        stage_fills({cid: (c["col"], c["row"]) for cid, c in world["chunks"].items()})
        return
    world = json.loads((ZONE / "world.json").read_text(encoding="utf-8"))
    grid = {cid: (c["col"], c["row"]) for cid, c in world["chunks"].items()}
    from_stage(grid)
    collisions = {cid: level(col) if row == 1 else traced(cid, row) for cid, (col, row) in grid.items()}
    drain_door(collisions["rcz-2-2"])
    gone = reachable_only(collisions, grid)
    (ZONE / "collision").mkdir(exist_ok=True)
    for cid, data in collisions.items():
        (ZONE / "collision" / f"{cid}.collision.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
        if grid[cid][1] == 0:
            blockout(data).save(ZONE / "blockout" / f"{cid}.png")
    world["links"] = [link for link in world["links"] if link["by"] == "door" and grid[link["a"]][1] == grid[link["b"]][1]]
    world["links"] += [{"a": f"rcz-{c}-0", "b": f"rcz-{c}-1", "by": "shaft", "note": "the maze's ladders onto the girder deck"}
                       for c in range(3)]
    world["links"] += [{"a": f"rcz-{c}-1", "b": f"rcz-{c}-1", "by": "ladder", "note": "the pier ladder: path <-> girder deck"}
                       for c in range(3)]
    world["links"].append({"a": "rcz-2-1", "b": "rcz-2-2", "by": "door", "note": "the culvert <-> the drain door"})
    world["traced"] = ("Collision traced from the painting (25 Oct): the level row measured, the bands above and below "
                       "from their depth keys; the band above's blockout redrawn from it (the kept rust maze).")
    (ZONE / "world.json").write_text(json.dumps(world, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    problems = wm.check(graph(collisions, grid))
    if "--stage" in sys.argv:
        export_stage(collisions, grid, world)
        from_stage(grid, drop=True)
    print(f"rusty-creek: collision for {len(collisions)} chunks ({gone} unreachable floor segments dropped); "
          + ("every surface reachable and leavable" if not problems else f"{len(problems)} problems, e.g. {problems[:4]}"))


if __name__ == "__main__":
    main()
