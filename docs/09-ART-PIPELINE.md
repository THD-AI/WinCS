# 09 – Art pipeline

<!-- nav:start -->
[← 08 – Tech stack and where things live](08-TECH-STACK.md) · [Design docs](README.md) · **9 / 13** · [10 – Jam plan →](10-JAM-PLAN.md)
<!-- nav:end -->

![Rusty Creek – seven layers composed](../art/stages/rusty-creek/images/after-center.png)

One rule above all: **every image comes from real references through a rerunnable script.** No one-off drawings that nobody can regenerate, and no text-only prompts.

```
real photos (Drive, outside Git) ─┐
reference games (references/)  ──┼─▶ config (*.json, prompts) ─▶ scripts/*.py ─▶ tmp/ raw ─▶ crush/verify ─▶ art/ (committed)
approved art (art/)            ──┘
```

## 1 · Visual direction (first, always)

`art/direction/direction.json` → `python scripts/make_boards.py draw --config art/direction/direction.json`

1. **Style master:** the real Rusty Creek plate + the hero sheet, finished as one in-game screenshot.
2. Every other direction image takes **the style master as its first input**, then its location collage, the hero sheet and one reference game. That is what keeps the pack in sync.
3. Review: one look at the whole pack side by side ([06](06-VISUAL-DIRECTION.md)). Redo an image with `--redo <id>`.

## 2 · Sprite boards

`art/sprites/boards.json` → `python scripts/make_boards.py draw [ids]`

- Inputs: the hero sheet (`art/sprites/images/hero-preview.png`, locked), the style master, and the photos of the actual pose or object. The chair photos are split into **block**, **overhead/up-down** and **side** sequences by file name.
- The model draws on a flat **magenta** key. `crush` keys the magenta at full size, downscales by 2 with premultiplied alpha (no purple fringes), quantises to 96 colours, and writes:
  - `art/sprites/images/<id>.png` – transparent 1× source
  - `art/sprites/images/<id>-preview.png` – the same image on paper, upscaled for reading
- People in pose photos are references only: the brief always says to draw our hero instead.
- What failed on 23 Oct, so nobody repeats it: style text placed before the brief (the model paints a scene), a whole stage plate passed as a "style sample" (the model redraws the stage), the "flare" model (it ignores layouts), and pose photos given without the hero sheet first (the model draws the photographed person).

## 3 · Stages – seven layers

`art/stages/rusty-creek/` – `python scripts/creek_layers.py --build`, then `python scripts/creek_layers.py` to verify.

| # | Role | Scroll | Collides? |
| --- | --- | --- | --- |
| 01 | Sky / distant trees | 0.2 | no |
| 02 | Rear masonry and supports (cut from the same structure as 05, so it scrolls with it) | 1.0 | no |
| 03 | Rocky bank | 1.0 | no (collision is authored separately) |
| 04 | Water / reflection mask | 1.0 | hazard zone |
| 05 | Broad girders and ladders (traversal) | 1.0 | authored polylines on top |
| 06 | Near rails (decorative) | 1.1 | never |
| 07 | Near foliage | 1.15 | never |

How a stage is made: draw the clean centre banner → extend left and right at the same width → repair the two join windows (`stage_art.py prepare/apply`, which copies back only the bounded band and checks that protected pixels are untouched) → split the repaired structure with the authored masks → export each role per chunk → recompose the previews and verify they match exactly. Shared scenery on the right chunk is stored once and referenced by an alias in `media-sources.json`.

**Previews are build outputs.** `after-*.png` (maze) and `before-*.png` (clean campus) are rebuilt from the plates by `--build`; nobody edits them by hand.

## 4 · Collision

Draw the colour-coded annotation from [04](04-WORLD-AND-LEVELS.md) over the composed stage → export `collision.json` (polylines, boxes, spawns) → the game loads it. Pixel masks are never used as collision.

## 5 · Export to the game

`scripts/export_atlas.py <board>` (written when the game scaffold lands): it slices frames out of a board by connected alpha regions, groups them by row into animations, scales them to game size (hero = 80 px), and writes a Phaser atlas (`.png` + `.json`) into `game/public/assets/`.

## What gets committed

- ✅ configs, prompts, crushed images and previews, stage plates, route and collision data
- ❌ photos, audio, raw API drawings (`tmp/`), contact sheets, HTML viewers

<!-- nav:start -->
[← 08 – Tech stack and where things live](08-TECH-STACK.md) · [Design docs](README.md) · **9 / 13** · [10 – Jam plan →](10-JAM-PLAN.md)
<!-- nav:end -->
