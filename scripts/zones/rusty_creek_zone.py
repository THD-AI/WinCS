"""Rusty Creek as a zone (#157, docs/09 "World pipeline"): 3 x 3 chunks grown from one start chunk cut 1:1 from the
#227 concept's level band – the rust maze above, the creek path, the drains below. Writes every chunk's collision,
re-traces the band above's blockout from its painting, and checks that the whole grid can be walked both ways.

    python scripts/zones/rusty_creek_zone.py

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
    # The key marks pillars and pipes with brick rows or brackets like rungs: a climb is a ladder only where both its
    # ends meet a floor, or the chunk edge that leads on to the next row.
    def meets(x0: int, x1: int, y: int) -> bool:
        return any(abs(hg_y - y) <= 32 for line in data["walk"] for a, b in zip(line, line[1:])
                   if a[0] <= x1 and b[0] >= x0 for hg_y in (a[1], b[1]))
    data["climb"] = [c for c in data["climb"]
                     if (meets(c["x"], c["x"] + c["w"], c["y"]) or c["y"] == 0)
                     and (meets(c["x"], c["x"] + c["w"], c["y"] + c["h"]) or c["y"] + c["h"] == H)]
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


def main() -> None:
    world = json.loads((ZONE / "world.json").read_text(encoding="utf-8"))
    grid = {cid: (c["col"], c["row"]) for cid, c in world["chunks"].items()}
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
    print(f"rusty-creek: collision for {len(collisions)} chunks ({gone} unreachable floor segments dropped); "
          + ("every surface reachable and leavable" if not problems else f"{len(problems)} problems, e.g. {problems[:4]}"))


if __name__ == "__main__":
    main()
