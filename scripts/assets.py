"""The asset system (#158): the inventory checked against what the repo actually holds.

    art/inventory.csv            every asset the slice needs: id, kind, size, frames/anims, sources, status
      + art/sprites/boards.json  the boards (prompt, inputs, atlas rows, review)
      + art/sprites/images/      drawn boards (make_boards.py draw + crush)
      + game/public/assets/      exported atlases, UI, stages (export_atlas.py, export_stage.py)
      -> status: the real state of each asset, derived from the files, and where the sheet disagrees
      -> check:  an exported atlas against the frame counts the inventory documents, and its clips' legibility at 1x
               on the stage where they appear (readability.py; LOW only if even the game's actor rim can't save it)
      -> next:   what is still missing or unreviewed, with the command that moves it on

The sheet is the plan; the files are the truth. A row whose status no longer matches the files is reported,
so the inventory never quietly drifts (docs/15, docs/09 "One asset system").

Usage:
    python scripts/assets.py status [--strict]   # table; --strict exits 1 on any disagreement
    python scripts/assets.py check <id>          # frame counts of one exported atlas vs the inventory
    python scripts/assets.py next                # missing / drawn / exported-unapproved, with the next command
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "art" / "inventory.csv"
BOARDS = ROOT / "art" / "sprites" / "boards.json"
IMAGES = ROOT / "art" / "sprites" / "images"
SPRITES = ROOT / "game" / "public" / "assets" / "sprites"
UI = ROOT / "game" / "public" / "assets" / "ui"
STAGES = ROOT / "art" / "stages"
# Derived states, from least to most done; "n/a" marks a row the slice turned out not to need.
ORDER = ["missing", "planned", "drawn", "exported", "approved", "n/a"]


def inventory(path: Path | None = None) -> list[dict[str, str]]:
    with (path or INVENTORY).open(encoding="utf-8", newline="") as f:
        return [row for row in csv.DictReader(f) if row.get("id")]


def boards(path: Path | None = None) -> dict[str, dict]:
    return {b["id"]: b for b in json.loads((path or BOARDS).read_text(encoding="utf-8"))["boards"]}


def frame_spec(text: str) -> dict[str, int]:
    """'idle 6 · idle-walk 2 · walk 8' -> {'idle': 6, 'idle-walk': 2, 'walk': 8}; anything else is ignored."""
    return {m.group(1): int(m.group(2)) for m in re.finditer(r"([a-z][a-z0-9-]*)\s+(\d+)\b", text or "")}


def derive(row: dict[str, str], board_map: dict[str, dict]) -> tuple[str, list[str]]:
    """The asset's real state from the files, and the problems found on the way."""
    aid, kind, problems = row["id"], row.get("kind", ""), []
    if kind == "data":
        found = sorted(p.relative_to(ROOT).as_posix() for p in STAGES.glob("*/*.json")
                       if p.name in ("atmosphere.json", "surfaces.json"))
        return ("approved" if found else "missing"), problems
    board = board_map.get(aid)
    if board is None:
        # Not a board (stage layers, code-drawn UI): the sheet's own status stands.
        return row.get("status", "missing").strip() or "missing", problems
    atlas = all((SPRITES / f"{aid}{ext}").exists() for ext in (".png", ".json", ".anims.json"))
    # Key art (export_key_art.py) is a plain image in the UI folder, not an atlas.
    exported = atlas or (UI / f"{aid}.png").exists()
    drawn = (IMAGES / f"{aid}.png").exists()
    approved = str(board.get("review", "")).startswith("✅")
    if exported:
        if atlas:
            problems += check(aid, row)
        state = "approved" if approved else "exported"
    elif drawn:
        state = "drawn"
    else:
        state = "planned"
    return state, problems


def check(aid: str, row: dict[str, str], legible: bool = False) -> list[str]:
    """An exported atlas's clips against the frame counts in the inventory row (names it documents only); with
    `legible`, also every clip's 1x readability on its stage (readability.py), failing what stays low with the rim."""
    anims_path = SPRITES / f"{aid}.anims.json"
    if not anims_path.exists():
        return [f"{aid}: not exported"]
    clips = json.loads(anims_path.read_text(encoding="utf-8"))
    problems = []
    for name, frames in frame_spec(row.get("frames/anims", "")).items():
        clip = clips.get(name)
        if clip is None:
            problems.append(f"{aid}: inventory lists '{name}' but the atlas has no such clip")
        elif clip.get("frames") != frames:
            problems.append(f"{aid}:{name}: {clip.get('frames')} frames exported, inventory says {frames}")
    if legible:
        import readability
        specs = [spec for spec in readability.every_clip(SPRITES) if spec.startswith(f"{aid}:")]
        _, report = readability.sheet(specs, [SPRITES], zoom=1)
        problems += [f"{aid}: unreadable at 1x – {line}" for line in report if "STILL LOW" in line or "MISSING" in line]
    return problems


def status(rows: list[dict[str, str]], board_map: dict[str, dict]) -> tuple[list[tuple[str, str, str, str]], list[str]]:
    """(id, kind, sheet status, derived status) per row, and every disagreement or problem."""
    table, issues = [], []
    for row in rows:
        derived, problems = derive(row, board_map)
        sheet = row.get("status", "").strip()
        table.append((row["id"], row.get("kind", ""), sheet, derived))
        issues += problems
        if sheet and sheet != derived and not (sheet == "approved" and derived == "approved"):
            issues.append(f"{row['id']}: the sheet says '{sheet}', the files say '{derived}'")
    # The other way round: an atlas the game loads that the plan never listed is an asset nobody tracks.
    listed = {row["id"] for row in rows}
    for path in sorted(SPRITES.glob("*.anims.json")):
        aid = path.name[: -len(".anims.json")]
        if aid not in listed:
            issues.append(f"{aid}: exported to the game but not in art/inventory.csv")
    return table, issues


def upcoming(rows: list[dict[str, str]], board_map: dict[str, dict]) -> list[str]:
    """What still needs work, least done first, each with the command that moves it on."""
    todo = []
    for row in rows:
        state, _ = derive(row, board_map)
        aid = row["id"]
        if state in ("approved", "n/a"):
            continue
        if state in ("missing", "planned") and aid in board_map:
            step = f"python scripts/make_boards.py draw {aid}"
        elif state == "drawn" and aid in board_map:
            step = f"python scripts/export_atlas.py {aid} --out tmp/atlas --preview  # then review"
        elif state == "exported" and aid in board_map:
            step = "Alexander's review, then mark the board ✅ in art/sprites/boards.json"
        else:
            step = row.get("notes", "") or "add a board to art/sprites/boards.json"
        todo.append((ORDER.index(state) if state in ORDER else 0, f"{aid} [{state}] -> {step}"))
    return [line for _, line in sorted(todo, key=lambda t: t[0])]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    s = sub.add_parser("status", help="every asset's real state and where the sheet disagrees")
    s.add_argument("--strict", action="store_true", help="exit 1 on any disagreement or failed check")
    c = sub.add_parser("check", help="an exported atlas against the inventory's frame counts")
    c.add_argument("id")
    sub.add_parser("next", help="what is missing or unreviewed, with the next command")
    args = parser.parse_args()
    rows, board_map = inventory(), boards()
    if args.mode == "status":
        table, issues = status(rows, board_map)
        width = max(len(r[0]) for r in table)
        for aid, kind, sheet, derived in table:
            mark = "" if sheet == derived else "  <- sheet: " + (sheet or "-")
            print(f"{aid:<{width}}  {kind:<12} {derived}{mark}")
        counts = {state: sum(1 for r in table if r[3] == state) for state in ORDER}
        print("\n" + " · ".join(f"{state} {n}" for state, n in counts.items() if n))
        for issue in issues:
            print("! " + issue)
        sys.exit(1 if args.strict and issues else 0)
    if args.mode == "check":
        row = next((r for r in rows if r["id"] == args.id), None)
        if row is None:
            sys.exit(f"{args.id} is not in art/inventory.csv")
        problems = check(args.id, row, legible=True)
        print("\n".join(problems) if problems else f"{args.id}: every documented clip matches")
        sys.exit(1 if problems else 0)
    for line in upcoming(rows, board_map):
        print(line)


if __name__ == "__main__":
    main()
