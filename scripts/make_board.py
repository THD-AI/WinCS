"""Create the jam's GitHub board: milestones, labels, epics with sub-issue stories, one project.

    python scripts/make_board.py            # dry run: prints everything it would create
    python scripts/make_board.py --apply    # creates it (needs `gh auth login`; project needs the 'project' scope)

Idempotent by title: existing milestones, labels and issues with the same title are reused.
The plan itself lives in BOARD below and mirrors docs/10-JAM-PLAN.md and docs/07-ASSET-MANIFEST.md.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

REPO = "THD-AI/WinCS"
PROJECT = "WinCS – DEGDEV 3"

MILESTONES = [
    ("M0 · Setup and pipeline", "2026-10-23T20:30:00+02:00", "Scaffold on Vercel, atlas export, the board itself."),
    ("M1 · Movement on Rusty Creek", "2026-10-24T00:00:00+02:00", "The hero walks, jumps, slides and climbs on the real stage."),
    ("M2 · Combat and enemies", "2026-10-24T03:00:00+02:00", "Chair, guard, damage, rover and crab."),
    ("M3 · Prologue and crossing", "2026-10-24T05:00:00+02:00", "Hidden Garden, Dexter, the pond, THD.exe."),
    ("M4 · Rusty Creek and Jenny", "2026-10-24T07:00:00+02:00", "Clean → anomaly, encounters, Jenny, Dexter absorbs."),
    ("M5 · Polish and submit", "2026-10-24T11:30:00+02:00", "HUD, sound, juice, playtest, final deploy."),
]

LABELS = [
    ("epic", "5319e7", "Milestone-sized goal; parent of stories"),
    ("story", "0e8a16", "Something a player (or the team) can do afterwards"),
    ("task", "c5def5", "Work nobody sees: tooling, docs"),
    ("bug", "d73a4a", "Something that worked, or should have, and doesn't"),
    ("area:player", "fbca04", "Hero movement and state"),
    ("area:combat", "e99695", "Weapons, damage, health"),
    ("area:enemies", "b60205", "Autonomous robots and bosses"),
    ("area:stage", "006b75", "Chunks, layers, collision, states"),
    ("area:story", "d4c5f9", "Prologue, Dexter, crossings"),
    ("area:art", "f9d0c4", "Generated art and sprite boards"),
    ("area:pipeline", "bfdadc", "Rerunnable scripts"),
    ("area:ui", "c2e0c6", "HUD, menus, crash window"),
    ("area:audio", "fef2c0", "Sound and music"),
    ("area:infra", "ededed", "Build, deploy, CI"),
    ("must", "000000", "The slice fails without it"),
    ("should", "555555", "Cut only after the 'could' items"),
    ("could", "aaaaaa", "First to cut"),
]

# (epic title, milestone index, labels, body, [(story title, labels, priority, acceptance criteria)])
BOARD = [
    ("Epic: Game scaffold and deploy", 0, ["area:infra"], "Phaser 3 + TypeScript + Vite in `game/`, deployed on Vercel. See docs/08-TECH-STACK.md.", [
        ("Scaffold Phaser 3 + TypeScript + Vite in game/", ["area:infra"], "must", ["`npm run dev` shows a 1280×720 pixel-art canvas (nearest filtering)", "`npm run build` passes type checks", "README explains how to run it"]),
        ("Deploy previews and production on Vercel", ["area:infra"], "must", ["Every PR gets a preview URL", "`main` deploys to the jam URL", "Documented in docs/08"]),
        ("Load stage chunks and sprite atlases", ["area:infra", "area:stage"], "must", ["Loads Rusty Creek's 3 chunks × 7 layers from art exports", "Loads a Phaser atlas (png + json)", "Missing assets fail loudly in dev"]),
        ("CI: build, docs check and art verification on every PR", ["area:infra"], "should", ["`npm run build` and `python scripts/check_docs.py` run in Actions", "`python scripts/creek_layers.py` runs when art changes"]),
    ]),
    ("Epic: Player movement", 1, ["area:player"], "Walk, run, jump, slopes, slides, one-way platforms, ladders (no ledge pull-up). See docs/02 and docs/04 (scale: hero 80 px).", [
        ("As a player I can walk and run with weight", ["area:player"], "must", ["3.5 m/s walk, 6 m/s run after 0.4 s", "Short acceleration and deceleration", "Faces the move direction"]),
        ("As a player I can jump with control", ["area:player"], "must", ["Variable height 1.2–2.2 m", "Coyote time 0.1 s and jump buffer 0.12 s", "Landing squash plays"]),
        ("As a player I can walk up hills and slide down steep slopes", ["area:player", "area:stage"], "must", ["Walks slopes ≤ 40° from collision polylines", "Slides on slopes > 40° and can jump off", "No jitter on slope changes"]),
        ("As a player I can drop through one-way platforms and climb", ["area:player"], "must", ["Stands on yellow lines, jumps up through them, ↓+Jump drops", "↑ in a climb zone climbs ladders, vines, scaffold", "No attacking while climbing"]),
        ("Animation state machine without rubbery transitions", ["area:player", "area:art"], "should", ["Idle→walk→run switch only on shared contact frames via the bridge clips", "Stepped 12 fps playback; idle variants play at random after 5 s", "See docs/09 'Smooth, not rubbery'"]),
        ("Camera follows with parallax layers", ["area:player", "area:stage"], "must", ["Look-ahead in the move direction", "Each layer scrolls at its factor (docs/04 layer table)", "Clamps to the chunk grid bounds"]),
    ]),
    ("Epic: Stage runtime", 1, ["area:stage"], "Chunk grid, layer stack, collision data, clean/anomaly states, atmosphere. See docs/04.", [
        ("Load collision annotation per chunk", ["area:stage"], "must", ["Reads `<chunk>.collision.json`: walk, slide, one-way, ledge, climb, solid, no-go, hazard, interactable, spawn", "Debug overlay draws it in the authoring colours"]),
        ("Swap a region from clean to anomaly", ["area:stage", "area:story"], "must", ["Touching the region's anomaly swaps the changed layers and collision", "Pushes the hero back to the region's start", "Plays the crossing sequence"]),
        ("Foreground blur, falling leaves and water reflections", ["area:stage", "area:art"], "should", ["Foreground blur layer at scroll 1.15–1.2 partly covers the view", "Leaf particles drift; up-drift in the anomaly state", "Water mirrors layers 1–6 with a ripple"]),
        ("Anomaly FX: image cuts, stretched pixels, 404 voids", ["area:stage", "area:ui"], "could", ["A shader or sprite slices apply each effect over a region of the frame", "Cheap: no per-frame redraw of art"]),
    ]),
    ("Epic: Combat", 2, ["area:combat"], "The chair, guard, damage, death and respawn. See docs/02.", [
        ("As a player I can sweep the chair sideways", ["area:combat"], "must", ["Tap Act: 8-frame side sweep; repeated taps alternate sweep A and B, each ending in a short recoil", "Hitbox on the contact frames; 60 ms hit-stop, spark, knockback on hit", "A light weapon: no ground crack or shockwave"]),
        ("As a player I can attack up and slam down", ["area:combat"], "should", ["↑+Act up attack", "↓+Act in the air: down slam that bounces off enemies (pogo)"]),
        ("As a player I can guard with the chair", ["area:combat"], "should", ["Hold Act: frontal block with small push-back", "Heavy hits (Jenny) break the guard"]),
        ("Health, damage, death and respawn", ["area:combat", "area:ui"], "must", ["5 battery cells; hit flash, knockback, 1 s invulnerability", "Death returns you to the last coffee machine with full health", "Hazards cost 1 cell and reset to safe ground"]),
        ("Coffee machine save point", ["area:combat", "area:story"], "must", ["↑ at the machine saves and refills health", "Respawn point updates"]),
    ]),
    ("Epic: Autonomous enemies", 2, ["area:enemies"], "THD's own autonomous machines, taken over by anomalies. See docs/05.", [
        ("Rover: patrol, spot, charge", ["area:enemies"], "must", ["Patrols a deck; lidar turns red 0.5 s before the charge", "3 chair hits; flips and leaks black fluid when defeated"]),
        ("Crab: creep, rear, stab", ["area:enemies"], "should", ["Front legs raised 0.6 s, then a stab", "4 hits"]),
        ("Drone: hover, drop parts, dive", ["area:enemies"], "could", ["Hovers out of chair reach, drops screws", "Hard to kill with the chair: the player hides under girders"]),
        ("Defeat: black fluid that Dexter absorbs later", ["area:enemies", "area:story"], "should", ["Defeated enemies stop dead and leave a black pool", "Pools disappear when Dexter absorbs them at the next save"]),
    ]),
    ("Epic: Prologue and crossing", 3, ["area:story"], "Hidden Garden, Dexter the plush, the pond, THD.exe. See docs/03.", [
        ("Hidden Garden walk with Dexter as the guide", ["area:story", "area:stage"], "must", ["About 3 minutes of calm walk on Lex's layout, less parkour", "Dexter hops ahead like the White Rabbit and waits", "At the pond Dexter points, then shoves the hero in – no dialogue, no thought bubble"]),
        ("Crossing: damage sprite, THD.exe window, landing", ["area:story", "area:ui"], "must", ["Touch → hit sprite → freeze → window 'THD.exe has stopped responding.' [OK]", "Act presses OK → cut → land in the next state; the damage sprite finishes", "Reusable for every region"]),
        ("Dexter at the coffee machine gives the pocket computer", ["area:story", "area:ui"], "should", ["No words: Dexter bows, sweats and hands it over", "Pocket computer unlocks the map menu"]),
    ]),
    ("Epic: Rusty Creek and Jenny", 4, ["area:stage", "area:enemies"], "The jam level: clean creek → Jenny's ram → rust maze as the tutorial, encounters, boss. See docs/03, docs/04 and docs/05.", [
        ("Clean creek and Jenny's ram turn the region", ["area:stage", "area:story"], "must", ["Clean Rusty Creek with no enemies after the landing", "Jenny crosses the bridge and rams the hero: cartoon knockback", "The region swaps to the rust maze and the hero restarts at its start"]),

        ("Annotate Rusty Creek collision (3 chunks, both states)", ["area:stage"], "must", ["Walk, one-way, ladders, solids, hazards, interactables and spawns for clean and anomaly", "Route from route.json is reachable in game", "The maze teaches jump, climb, ladders and the chair in that order"]),
        ("Place encounters and pickups", ["area:stage", "area:enemies"], "must", ["Rover tutorial in chunk 1, crab + rovers in chunk 2, drone over the low route", "Chair, muffin, Leberkäse roll, notes in the dead ends"]),
        ("Jenny: rev, charge, crash, debris, stunned – three phases", ["area:enemies"], "must", ["30 hits; phase 2 double charge + loose wheel; phase 3 jump charge", "Armoured front: hits land only from behind or while stunned", "Crashes into the pillars and throws scrap; charge costs 2 cells and breaks guard, parts cost 1"]),
        ("Dexter absorbs Jenny and the slice ends", ["area:story"], "must", ["Dexter appears, absorbs the black fluid, visibly taller", "'To be continued' crash window, then credits"]),
    ]),
    ("Epic: Art pipeline and assets", 0, ["area:art", "area:pipeline"], "Rerunnable art: sprite boards, atlases, chunks in four directions. See docs/09.", [
        ("Sprite boards from the approved direction", ["area:art"], "must", ["Hero move, air, hurt; chair side, overhead, block; rover, crab, drone; Jenny; Dexter; props – frame lists as in docs/07", "Each board reviewed on its page with an in-game-size looping preview; hero sheet first, style master last", "Sheets are layered and masked so they can be revised"]),
        ("export_atlas.py: board → game atlas", ["area:pipeline"], "must", ["Slices frames by alpha and rows, scales to game size (hero 80 px)", "Writes Phaser atlas png + json into game/public/assets"]),
        ("Up/down join windows in stage_art.py", ["area:pipeline"], "should", ["Vertical seams repaired like horizontal ones, protected pixels verified", "Tests in test_stage_art.py"]),
        ("Neighbour and transition chunks", ["area:pipeline", "area:stage"], "should", ["`make_boards.py neighbour --dir` produces a chunk from an edge band", "A transition chunk (surface → underground) is generated with both neighbours as context"]),
        ("Generalise the layer split beyond Rusty Creek", ["area:pipeline"], "should", ["One script splits any composed chunk into the docs/04 layer stack", "Recomposition verified pixel-exact"]),
        ("Hidden Garden as layered chunks", ["area:art", "area:stage"], "must", ["From its stage concept; layers + collision; Dexter spot and pond anomaly marked"]),
        ("Redo the Campus and Toxic Garden concepts", ["area:art"], "could", ["Flat side elevation, collage palette, scaffold as climb route (Campus), outdoor corten beds (Toxic Garden)"]),
    ]),
    ("Epic: HUD, menus and audio", 5, ["area:ui", "area:audio"], "Minimal Hollow Knight-style HUD, pocket computer, sound. See docs/06.", [
        ("HUD: battery cells and glitch meter", ["area:ui"], "must", ["Top-left; cells full/cracked/empty", "Meter hidden until unlocked", "Food heals a set amount; Leberkäse adds a short defence boost"]),
        ("Pocket computer map screen", ["area:ui"], "could", ["Green CRT map; rooms fill in as visited"]),
        ("Title screen and credits", ["area:ui"], "must", ["Title, start, credits incl. NOTICE sources"]),
        ("Sound: CC0 effects and ambient loops", ["area:audio"], "should", ["Footsteps, chair, robots, Jenny, crash ding, one loop per region", "Every source listed in NOTICE.md"]),
    ]),
    ("Epic: Playtest and submission", 5, ["area:infra"], "Ship before 11:30 Saturday. See docs/10.", [
        ("Outside playtest at breakfast", ["area:infra"], "must", ["Someone outside the team plays the slice", "Bugs filed with the bug label"]),
        ("Final deploy and submission", ["area:infra"], "must", ["Production URL stable on desktop browsers", "Submitted in the organisers' format before 11:30"]),
        ("Two-minute demo script", ["area:story"], "should", ["Who talks, what we show, a backup recording"]),
    ]),
]


def gh(args: list[str], apply: bool) -> str:
    if not apply:
        return ""
    result = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        sys.exit(f"gh {' '.join(args[:3])}… failed: {result.stderr.strip()}")
    return result.stdout


def story_body(epic: str, criteria: list[str], priority: str) -> str:
    return (f"Part of **{epic}**.\n\n## Acceptance criteria\n\n" + "\n".join(f"- [ ] {c}" for c in criteria)
            + f"\n\nPriority: `{priority}` · cut order in docs/10-JAM-PLAN.md\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    apply = parser.parse_args().apply
    sys.stdout.reconfigure(encoding="utf-8")  # titles contain arrows; Windows consoles default to cp1252

    existing_labels = set()
    existing_issues: dict[str, int] = {}
    if apply:
        existing_labels = {l["name"] for l in json.loads(gh(["label", "list", "-R", REPO, "--limit", "200", "--json", "name"], True))}
        existing_issues = {i["title"]: i["number"] for i in json.loads(
            gh(["issue", "list", "-R", REPO, "--state", "all", "--limit", "500", "--json", "title,number"], True))}
        milestones = {m["title"] for m in json.loads(gh(["api", f"repos/{REPO}/milestones?state=all&per_page=100"], True))}
    else:
        milestones = set()

    for name, color, desc in LABELS:
        print(f"label     {name}")
        if apply and name not in existing_labels:
            gh(["label", "create", name, "-R", REPO, "--color", color, "--description", desc], True)
    for title, due, desc in MILESTONES:
        print(f"milestone {title} (due {due})")
        if apply and title not in milestones:
            gh(["api", f"repos/{REPO}/milestones", "-f", f"title={title}", "-f", f"due_on={due}", "-f", f"description={desc}"], True)

    created = []
    for epic, m, labels, body, stories in BOARD:
        milestone = MILESTONES[m][0]
        print(f"\nEPIC  {epic}  [{milestone}]")
        epic_no = existing_issues.get(epic)
        if apply and not epic_no:
            url = gh(["issue", "create", "-R", REPO, "--title", epic, "--body", body + "\n\nStories are attached as sub-issues.",
                      "--milestone", milestone, *sum([["--label", l] for l in ["epic", *labels]], [])], True).strip()
            epic_no = int(url.rsplit("/", 1)[1])
        created.append(epic_no)
        for title, slabels, priority, criteria in stories:
            print(f"  story {title}  ({priority}; {len(criteria)} criteria)")
            if not apply:
                continue
            number = existing_issues.get(title)
            if not number:
                url = gh(["issue", "create", "-R", REPO, "--title", title, "--body", story_body(epic, criteria, priority),
                          "--milestone", milestone, *sum([["--label", l] for l in ["story", priority, *slabels]], [])], True).strip()
                number = int(url.rsplit("/", 1)[1])
            issue_id = json.loads(gh(["api", f"repos/{REPO}/issues/{number}"], True))["id"]
            subprocess.run(["gh", "api", f"repos/{REPO}/issues/{epic_no}/sub_issues", "-F", f"sub_issue_id={issue_id}"],
                           capture_output=True)  # already attached → harmless 422
            created.append(number)

    if apply:
        owner = REPO.split("/")[0]
        result = subprocess.run(["gh", "project", "create", "--owner", owner, "--title", PROJECT, "--format", "json"],
                                capture_output=True, text=True, encoding="utf-8")
        if result.returncode:
            print(f"\nProject not created ({result.stderr.strip()}). Run `gh auth refresh -s project` and rerun.")
            return
        number = json.loads(result.stdout)["number"]
        for issue in created:
            gh(["project", "item-add", str(number), "--owner", owner, "--url", f"https://github.com/{REPO}/issues/{issue}"], True)
        print(f"\nProject #{number} created with {len(created)} items.")
    else:
        stories = sum(len(e[4]) for e in BOARD)
        print(f"\nDry run: {len(LABELS)} labels, {len(MILESTONES)} milestones, {len(BOARD)} epics, {stories} stories. Use --apply.")


if __name__ == "__main__":
    main()
