"""Check stage collision files (docs/13 contract) and draw review overlays.

    art/stages/<region>/<chunk>.<state>.collision.json
      -> schema: fields, integer stage pixels, polylines left to right, boxes inside the chunk
      -> reach:  with the 28x76 body, every spawn, pickup and trigger can be reached from the
                 player spawn (or the chunk's left edge), and the chunk's right edge is reachable
      -> joins:  neighbouring chunks of one state meet at the same ground height
      -> terrain: typed floor ranges (docs/04 terrain model) - known kinds and materials, every floor
         covered, plank/stair/step treads flat, no floor over the pond's water pixels, no wall face
         taller than a jump where a lower floor stops at its foot
      -> --surfaces: <region>/surfaces.json chunk ranges rebuilt from the terrain (materials stay)
      -> --overlay: <region>/collision/<chunk>.<state>.png, the docs/04 legend over the art at half
         size, committed next to the data for review

<region>/chunks.json names the chunks left to right and the art each state is drawn on.

Movement envelope (docs/02 + docs/04, conservative until the controller is tuned in M1):
a held jump rises 96 px, so a ledge counts as reachable up to 88 px higher and 140 px across.
Dropping is free: fall damage does not exist. Girder decks are one-way: the hero walks in front
of the maze, so headroom only matters under `solid` boxes.

Usage:
    python scripts/collision_check.py [art/stages/rusty-creek] [--overlay] [--surfaces]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGES = ROOT / "art" / "stages"
BODY = (28, 76)
RISE = 88       # highest ledge a held jump reaches, with margin (96 px in docs/04)
ACROSS = 140    # widest gap a running jump clears
FLOATS = ("drone", "balloon", "pipe-eyes", "dexter-sighting", "lamp", "drip")  # need no reachable floor: they fly,
# float, stand, hang on a wall (a lamp) or fall from the ceiling (a drip)
# where the hero cannot go (stage/props.ts, story/sightings.ts)
SNAP = 6        # ends this close count as one continuous floor
STEP_UP = 16    # rises the grounded body walks up without a jump (game/src/player/body.ts)
FACE_DEPTH = 120  # a floor this far under a line end makes it an overhang, not a face (body.ts)
FACE_REACH = 100  # a face stops feet at most this far below its top; taller ones are background (body.ts)
STREAM = 64     # water narrower than this under the feet is a stream crossing the floor, not a pond
TERRAIN = {"ground", "step", "stair", "plank", "ledge", "wall", "log", "obstacle", "slide"}
FLAT = {"step", "stair", "plank"}  # treads: never a slope
FLAT_SLOPE = 0.05
LISTS = ["walk", "slide", "oneWay"]
BOXES = ["climb", "solid", "noGo", "hazard", "interact", "glideLift"]
POINTS = ["spawn", "ledge"]
KIND = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
# Legend colours from docs/04 (RGBA for the overlay).
COLOURS = {"walk": (40, 220, 60), "slide": (150, 90, 40), "oneWay": (255, 220, 0), "climb": (40, 110, 255),
           "solid": (230, 30, 30), "noGo": (0, 0, 0), "hazard": (255, 140, 0), "interact": (170, 60, 220),
           "spawn": (255, 255, 255), "ledge": (0, 230, 230), "glideLift": (170, 210, 255)}


def validate(data: dict, name: str) -> list[str]:
    errors = []
    for key in ["chunk", "state", "size", *LISTS, *BOXES, *POINTS]:
        if key not in data:
            errors.append(f"{name}: missing field {key!r}")
    if errors:
        return errors
    w, h = data["size"]
    if not f"{data['chunk']}.{data['state']}" in name:
        errors.append(f"{name}: chunk/state {data['chunk']}.{data['state']} do not match the file name")

    def inside(x, y, what):
        if not (isinstance(x, int) and isinstance(y, int)):
            errors.append(f"{name}: {what} has non-integer coordinates")
        elif not (0 <= x <= w and 0 <= y <= h):
            errors.append(f"{name}: {what} at ({x}, {y}) is outside the {w}x{h} chunk")

    for key in LISTS:
        for i, line in enumerate(data[key]):
            if len(line) < 2:
                errors.append(f"{name}: {key}[{i}] needs two points")
            for x, y in line:
                inside(x, y, f"{key}[{i}]")
            if any(b[0] <= a[0] for a, b in zip(line, line[1:])):
                errors.append(f"{name}: {key}[{i}] must run left to right")
            for a, b in zip(line, line[1:]):
                steep = abs(b[1] - a[1]) > abs(b[0] - a[0]) * 0.8391  # tan 40°
                if key == "walk" and steep:
                    errors.append(f"{name}: walk[{i}] has a slope over 40° at {a}->{b}; make it a slide")
    for key in BOXES:
        for i, box in enumerate(data[key]):
            inside(box["x"], box["y"], f"{key}[{i}]")
            inside(box["x"] + box["w"], box["y"] + box["h"], f"{key}[{i}]")
            if key in ("climb", "interact") and not KIND.match(box.get("kind", "")):
                errors.append(f"{name}: {key}[{i}] needs a lower-case kind")
            if key == "interact" and not box.get("id"):
                errors.append(f"{name}: interact[{i}] needs an id")
            if key == "hazard" and not isinstance(box.get("damage"), int):
                errors.append(f"{name}: hazard[{i}] needs an integer damage")
    for key in POINTS:
        for i, point in enumerate(data[key]):
            inside(point["x"], point["y"], f"{key}[{i}]")
            if key == "spawn" and not (KIND.match(point.get("kind", "")) and point.get("id")):
                errors.append(f"{name}: spawn[{i}] needs a kind and an id")
    ids = [o["id"] for k in ("climb", "interact", "spawn") for o in data[k] if o.get("id")]
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"{name}: id {dup!r} is used twice")
    return errors


def y_at(line: list, x: float) -> float | None:
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


def surfaces(data: dict) -> list[dict]:
    out = []
    for key in ("walk", "oneWay", "slide"):
        for line in data[key]:
            out.append({"key": key, "line": line, "x0": line[0][0], "x1": line[-1][0]})
    return out


def blocked(data: dict, x0: float, x1: float, feet: float) -> bool:
    """Would the body walking along y=feet between x0 and x1 run into a solid box?"""
    lo, hi = min(x0, x1), max(x0, x1)
    return any(b["x"] < hi + BODY[0] / 2 and b["x"] + b["w"] > lo - BODY[0] / 2
               and b["y"] < feet - 2 and b["y"] + b["h"] > feet - BODY[1] for b in data["solid"])


def links(data: dict, s: list[dict]) -> dict[int, set[int]]:
    """Surface graph: walk on, step across, jump up, drop down, climb."""
    edges = {i: set() for i in range(len(s))}

    def link(a, b):
        edges[a].add(b)

    for i, a in enumerate(s):
        for j, b in enumerate(s):
            if i == j:
                continue
            # Points of a and b to compare: ends, plus b's span over a (for drops and jumps through).
            for ax, ay in (a["line"][0], a["line"][-1]):
                outward = -1 if (ax, ay) == tuple(a["line"][0]) else 1
                for bx in (b["x0"], b["x1"], min(max(ax, b["x0"]), b["x1"])):
                    by = y_at(b["line"], bx)
                    dx = (bx - ax) * outward
                    if dx < -SNAP:
                        continue
                    wall = blocked(data, ax, bx, max(ay, by))
                    if abs(dx) <= SNAP and abs(by - ay) <= SNAP and not wall:
                        link(i, j)                  # one continuous floor
                    elif by >= ay and dx <= ACROSS + (by - ay) / 2 and not blocked(data, ax, bx, ay):
                        link(i, j)                  # walk off the end: only walls taller than the start block
                    elif 0 < ay - by <= RISE and dx <= ACROSS and not wall:
                        link(i, j)                  # jump up from the end
            # From anywhere on a: a one-way above is jumped through, a one-way below is dropped through.
            lo, hi = max(a["x0"], b["x0"]), min(a["x1"], b["x1"])
            if lo < hi:
                mid = (lo + hi) / 2
                ay, by = y_at(a["line"], mid), y_at(b["line"], mid)
                if 0 < ay - by <= RISE:
                    link(i, j)              # floors are one-sided: jump up onto any line above
                if a["key"] == "oneWay" and by > ay:
                    link(i, j)
    for box in data["climb"]:
        touching = [i for i, a in enumerate(s)
                    if a["x0"] - BODY[0] / 2 <= box["x"] + box["w"] / 2 <= a["x1"] + BODY[0] / 2
                    and (y := y_at(a["line"], min(max(box["x"] + box["w"] / 2, a["x0"]), a["x1"]))) is not None
                    and box["y"] - SNAP <= y <= box["y"] + box["h"] + SNAP]
        for i in touching:
            edges[i].update(t for t in touching if t != i)
    return edges


def standing(s: list[dict], x: float, y: float, reach: float = 12) -> list[int]:
    """Surfaces the body can stand on with its feet near (x, y)."""
    out = []
    for i, a in enumerate(s):
        if a["x0"] - BODY[0] / 2 <= x <= a["x1"] + BODY[0] / 2:
            fy = y_at(a["line"], min(max(x, a["x0"]), a["x1"]))
            if fy is not None and -reach <= fy - y <= reach:
                out.append(i)
    return out


def reach(data: dict, name: str) -> list[str]:
    errors = []
    s = surfaces(data)
    edges = links(data, s)
    w = data["size"][0]
    player = [p for p in data["spawn"] if p["kind"] == "player"]
    start = standing(s, player[0]["x"], player[0]["y"]) if player else \
        [i for i, a in enumerate(s) if a["x0"] <= SNAP]
    if not start:
        return [f"{name}: no floor at the player spawn or the chunk's left edge"]
    seen, todo = set(start), list(start)
    while todo:
        for j in edges[todo.pop()] - seen:
            seen.add(j)
            todo.append(j)
    if not any(s[i]["x1"] >= w - SNAP for i in seen) and not any(
            b["kind"] == "chunk-exit" for b in data["interact"]):
        errors.append(f"{name}: the right edge is not reachable")
    for p in data["spawn"]:
        if p["kind"] in FLOATS:
            continue  # flies, floats or hides in a wall
        if not set(standing(s, p["x"], p["y"], 40 if p["kind"] != "player" else 12)) & seen:
            errors.append(f"{name}: spawn {p['id']} at ({p['x']}, {p['y']}) is not on a reachable floor")
    for b in data["interact"]:
        if not touches(s, seen, b):
            errors.append(f"{name}: interact {b['id']} is not reachable by the body")
    return errors


def touches(s: list[dict], seen: set[int], box: dict) -> bool:
    """Can the body, standing on a reachable floor, overlap the box?"""
    for i in seen:
        a = s[i]
        for x in range(max(a["x0"], box["x"] - BODY[0] // 2), min(a["x1"], box["x"] + box["w"] + BODY[0] // 2) + 1, 4):
            y = y_at(a["line"], x)
            if y is not None and y - BODY[1] < box["y"] + box["h"] and y > box["y"]:
                return True
    return False


def faces(data: dict) -> list[dict]:
    """Line ends nothing passes under: the walls body.ts stops a body at (side -1 faces left)."""
    every = [line for k in ("walk", "slide") for line in data[k]]
    under = every + data["oneWay"]
    out = []
    for line in every:
        for (x, top), side in ((line[0], -1), (line[-1], 1)):
            passes = any(o is not line and (h := y_at(o, x - side)) is not None and top + STEP_UP < h <= top + FACE_DEPTH
                         for o in under)
            continues = any(o is not line and (h := y_at(o, x + side)) is not None and abs(h - top) <= STEP_UP
                            for o in under)
            if not passes and not continues:
                out.append({"x": x, "top": top, "side": side})
    return out


def terrain(data: dict, name: str, materials: set | None) -> list[str]:
    """The typed terrain: kinds, materials, coverage of every floor, flat treads, wall heights."""
    errors = []
    ranges = data.get("terrain")
    if ranges is None:
        return errors
    for i, t in enumerate(ranges):
        x = t.get("x")
        if not (isinstance(x, list) and len(x) == 2 and x[0] < x[1]):
            errors.append(f"{name}: terrain[{i}] needs an x range")
            return errors
        if t.get("kind") not in TERRAIN:
            errors.append(f"{name}: terrain[{i}] kind {t.get('kind')!r} is not one of {sorted(TERRAIN)}")
        if materials is not None and t.get("material") not in materials:
            errors.append(f"{name}: terrain[{i}] material {t.get('material')!r} is not in surfaces.json")

    def typed(x: float, y: float):
        return next((t for t in ranges if t["x"][0] <= x < t["x"][1]
                     and (not t.get("y") or t["y"][0] <= y < t["y"][1])), None)

    for key in ("walk", "slide", "oneWay"):
        for i, line in enumerate(data[key]):
            for a, b in zip(line, line[1:]):
                t = typed((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                if t is None:
                    errors.append(f"{name}: {key}[{i}] at {a}->{b} has no terrain type")
                elif t["kind"] in FLAT and abs(b[1] - a[1]) > abs(b[0] - a[0]) * FLAT_SLOPE:
                    errors.append(f"{name}: {key}[{i}] {t['kind']} at {a}->{b} is a slope; treads are flat")
    for f in faces(data):
        # The floor that stops at the face's foot, just outside it.
        below = [h for line in data["walk"] + data["slide"] + data["oneWay"]
                 if (h := y_at(line, f["x"] + f["side"])) is not None and h > f["top"]]
        if below and RISE < min(below) - f["top"] <= FACE_REACH:
            errors.append(f"{name}: wall at x={f['x']} is {min(below) - f['top']:.0f} px tall, more than a jump ({RISE})")
    return errors


def water(data: dict, name: str, region: Path) -> list[str]:
    """No floor stands on the pond: the pixels under the feet are water and not play."""
    wet = region / "layers" / f"{data['chunk']}.04-water.png"
    play = region / "layers" / f"{data['chunk']}.05-play.png"
    if not wet.exists() or not play.exists():
        return []
    import numpy as np
    from PIL import Image
    w = np.array(Image.open(wet).convert("RGBA"))[:, :, 3] > 128
    p = np.array(Image.open(play).convert("RGBA"))[:, :, 3] > 128
    rows = np.where(w.mean(axis=1) > 0.5)[0]
    if not len(rows):
        return []
    surface = int(rows.min())  # the pond's waterline: the first row that is mostly water
    errors = []
    for key in ("walk", "oneWay"):
        for i, line in enumerate(data[key]):
            bad = []
            for x in range(line[0][0], line[-1][0] + 1, 4):
                yy = int(round(y_at(line, x))) + 4
                if surface - 2 <= yy < w.shape[0] and x < w.shape[1] and w[yy, x] and not p[yy, x]:
                    bad.append(x)
            # A wet run narrower than STREAM is a stream or a splash crossing the floor (a drain's outlet), not a pond.
            runs = [[bad[0], bad[0]]] if bad else []
            for x in bad[1:]:
                if x - runs[-1][1] > 4:
                    runs.append([x, x])
                runs[-1][1] = x
            for x0, x1 in runs:
                if x1 - x0 >= STREAM:
                    errors.append(f"{name}: {key}[{i}] stands on water at x={x0}..{x1}")
    return errors


def write_surfaces(region: Path, loaded: dict) -> None:
    """surfaces.json keeps its materials; each typed chunk's ranges come from its terrain."""
    path = region / "surfaces.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    typed = {chunk: geo["terrain"] for (chunk, _state), geo in sorted(loaded.items()) if geo.get("terrain") is not None}
    if not typed:
        return
    for chunk, ranges in typed.items():
        data["chunks"][chunk] = [{k: v for k, v in (("x", t["x"]), ("y", t.get("y")), ("material", t["material"]),
                                                     ("note", f"{t['kind']}: {t['note']}" if t.get("note") else t["kind"]))
                                  if v is not None} for t in ranges]
    # One material and one range per line, as the file is written by hand.
    line = lambda v: json.dumps(v, ensure_ascii=False)
    out = ["{"] + [f' {line(k)}: {line(v)},' for k, v in data.items() if k not in ("materials", "chunks")]
    out += [' "materials": {', ",\n".join(f"  {line(k)}: {line(v)}" for k, v in data["materials"].items()), " },"]
    out += [' "chunks": {', ",\n".join(f"  {line(c)}: [\n" + ",\n".join(f"   {line(r)}" for r in rs) + "\n  ]"
                                       for c, rs in data["chunks"].items()), " }", "}"]
    path.write_bytes(("\n".join(out) + "\n").encode("utf-8"))


def floor_at_edge(data: dict, right: bool) -> float | None:
    x = data["size"][0] if right else 0
    ys = [y_at(a["line"], x) for a in surfaces(data) if a["key"] == "walk" and a["x0"] <= x <= a["x1"]]
    ys = [y for y in ys if y is not None]
    return max(ys) if ys else None


def overlay(data: dict, art: Path, out: Path) -> None:
    from PIL import Image, ImageDraw
    image = Image.open(art).convert("RGBA")
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for key in ("noGo", "hazard", "climb", "solid", "interact", "glideLift"):
        c = COLOURS[key]
        for b in data[key]:
            d.rectangle((b["x"], b["y"], b["x"] + b["w"] - 1, b["y"] + b["h"] - 1), fill=(*c, 70), outline=(*c, 255), width=3)
            if b.get("id") or b.get("kind"):
                d.text((b["x"] + 4, b["y"] + 4), b.get("id") or b["kind"], fill=(255, 255, 255, 255))
    for b in data["noGo"]:
        if b.get("kind") == "water":
            d.rectangle((b["x"], b["y"], b["x"] + b["w"] - 1, b["y"] + b["h"] - 1), fill=(40, 120, 255, 70))
    for key in ("walk", "oneWay", "slide"):
        for line in data[key]:
            d.line([tuple(p) for p in line], fill=(*COLOURS[key], 255), width=5)
    for f in faces(data):
        d.line([(f["x"], f["top"]), (f["x"], f["top"] + 50)], fill=(*COLOURS["solid"], 255), width=5)
    for t in data.get("terrain", []):
        ys = [y for k in ("walk", "oneWay", "slide") for line in data[k]
              if (y := y_at(line, (t["x"][0] + t["x"][1]) / 2)) is not None and (not t.get("y") or t["y"][0] <= y < t["y"][1])]
        if ys:
            d.text(((t["x"][0] + t["x"][1]) / 2 - 24, min(ys) + 10), f"{t['kind']}/{t['material']}", fill=(255, 255, 255, 255))
    for p in data["spawn"]:
        x, y = p["x"], p["y"]
        if p["kind"] == "player":
            d.rectangle((x - BODY[0] // 2, y - BODY[1], x + BODY[0] // 2, y), outline=(255, 255, 255, 255), width=2)
        d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 255, 255, 255), outline=(0, 0, 0, 255))
        d.text((x + 8, y - 16), p["id"], fill=(255, 255, 255, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    done = Image.alpha_composite(image, layer).convert("RGB")
    done.resize((done.width // 2, done.height // 2), Image.Resampling.LANCZOS).save(out, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="*", type=Path, help="region folders (default: every stage)")
    parser.add_argument("--overlay", action="store_true", help="draw <region>/collision/<chunk>.<state>.png")
    parser.add_argument("--surfaces", action="store_true", help="rebuild <region>/surfaces.json ranges from the terrain")
    args = parser.parse_args()
    regions = args.regions or sorted(p for p in STAGES.iterdir() if p.is_dir())
    errors, count = [], 0
    for region in regions:
        files = sorted(region.glob("*.collision.json"))
        order = json.loads((region / "chunks.json").read_text(encoding="utf-8")) if (region / "chunks.json").exists() else None
        loaded = {}
        surfaces_file = region / "surfaces.json"
        materials = set(json.loads(surfaces_file.read_text(encoding="utf-8"))["materials"]) if surfaces_file.exists() else None
        for path in files:
            name = path.name
            data = json.loads(path.read_text(encoding="utf-8"))
            problems = validate(data, name)
            if not problems:
                problems = reach(data, name) + terrain(data, name, materials) + water(data, name, region)
            errors += problems
            loaded[(data.get("chunk"), data.get("state"))] = data
            count += 1
            if args.overlay and order and not problems:
                art = region / order["art"][data["state"]].format(chunk=order["chunks"][data["chunk"]])
                overlay(data, art, region / "collision" / f"{data['chunk']}.{data['state']}.png")
        if args.surfaces and surfaces_file.exists():
            write_surfaces(region, loaded)
        if order:
            for state in order["art"]:
                chain = list(order["chunks"])
                for a, b in zip(chain, chain[1:]):
                    if (a, state) in loaded and (b, state) in loaded:
                        ya, yb = floor_at_edge(loaded[(a, state)], True), floor_at_edge(loaded[(b, state)], False)
                        if ya is None or yb is None or abs(ya - yb) > SNAP:
                            errors.append(f"{region.name}: {a} and {b} ({state}) meet at different ground heights {ya} / {yb}")
    for e in errors:
        print(e)
    print(f"Checked {count} collision files: {len(errors)} problems.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
