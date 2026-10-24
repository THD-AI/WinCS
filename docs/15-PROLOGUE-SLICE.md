# 15 – The prologue slice (rebuild)

<!-- nav:start -->
[← 13 – Production pipeline](13-PRODUCTION-PIPELINE.md) · [Design docs](README.md) · **14 / 15** · [Meetings and voice notes →](meetings/README.md)
<!-- nav:end -->

Alexander, Sat 24 Oct ~04:30: the game must run, look and feel like `art/`, from the menu through the Hidden Garden prologue into the anomaly – as one system that works the same locally and in production, not a set of hardcoded scenes. This page is the plan and the contract every workstream builds against. Integration branch: **`slice/prologue`** (main + #154 + #164). Every workstream branches from it and opens a PR, ready for review, **into it**; Claude reviews, plays and merges there; `slice/prologue` reaches main on Alexander's word. Progress lives in [prologue-tracker.csv](prologue-tracker.csv).

## What the player gets

```mermaid
flowchart LR
  L["loading<br/>art-directed, progress,<br/>never stalls"] --> M["menu<br/>DEGGSTER.EXE over the garden,<br/>Start / Credits"]
  M --> G["Hidden Garden, clean<br/>wind in grass and leaves,<br/>falling leaves, pond reflections,<br/>blurred foreground over the hero"]
  G --> Q["first quest<br/>Dexter sits on the bench;<br/>walk up – he hops off and<br/>waddles ahead, looking back"]
  Q --> W["follow Dexter<br/>waypoints 1–5: birch, oak crest,<br/>terrace roof, gap;<br/>secrets behind grass"]
  W --> P["the pond<br/>Dexter points at the water,<br/>the reflection is wrong"]
  P --> S["the shove<br/>Dexter pushes you in"]
  S --> E["404<br/>the frame tears, a 404 void opens,<br/>THD.exe – 404, you are pulled in"]
  E --> A["the anomaly<br/>land in Rusty Creek (clean)"]
```

## Quality bar (Alexander's list)

| Area | What "done" means |
| --- | --- |
| Loading and menu | An art-directed loading screen with real progress; a menu in the game's style over the garden art; no stall, no race, the same on Vercel as on `npm run dev` |
| Layers | Every exported layer drawn in its order and scroll: sky, far, mid (region plates), rear, water, play, foreground |
| Foreground | Layers nearest the camera (07) are slightly blurred (depth of field) and **pass over the hero** |
| Wind | Grass, leaves and trees sway – the nearer, the more – with gusts; backgrounds drift; nothing is static |
| Leaves | Falling leaves in front of and behind the hero, in the garden's autumn palette |
| Water | The pond reflects the scene and the hero, with ripples and a shimmer; lily pads bob |
| Grounding | The hero stands *in* the ground, not on top of it: feet sink 2–4 px by surface (grass, mud, stone, wood), dust or leaves kicked up by steps and landings |
| Motion | Every animation smooth: stride-paced walk and run (#164), clean transitions, no pops, steady camera |
| Story | Wordless (A14): the first quest, Dexter, the pond, the shove, the 404, the pull into the anomaly |
| System | Data-driven: stage.json, collision.json, anims.json, a surfaces file and an atmosphere file per region – no region names or coordinates in code |

## Workstreams

| # | Workstream | Owns (only these files) | Delivers |
| --- | --- | --- | --- |
| 1 | **Boot, loading, menu** | `game/src/boot/` (new), `Boot` + `Preload` moved out of `game/src/core/scaffold.ts`, `game/src/ui/Title.ts`, `game/src/stage/assets.ts` | one manifest-driven loader (no scene loads on its own), loading screen, menu, fade into the garden |
| 2 | **Stage renderer and atmosphere** | `game/src/stage/render.ts`, `game/src/stage/atmosphere/` (new), `game/src/fx/atmosphere*.ts`, `art/stages/<region>/atmosphere.json` (new) | layer drawing, foreground blur + occlusion, wind sway, falling leaves, water reflection and ripples |
| 3 | **Hero feel and grounding** | `game/src/player/`, `game/src/stage/camera.ts`, `art/stages/<region>/surfaces.json` (new) | feet sink by surface, step / land FX, smooth transitions, camera |
| 4 | **Prologue story** | `game/src/story/` (new `Prologue*.ts`, `Flow.ts`, `Crossing.ts`), the `interact` and `spawn` entries of `art/stages/hidden-garden/*.collision.json`, docs/03 prologue | the first quest, Dexter's walk, the pond, the shove, the 404 and the pull |
| 5 | **Art** | `art/sprites/`, `art/ui/`, `scripts/make_boards.py` configs, `game/public/assets/sprites|ui/` exports | every missing sprite (falling leaves, ripples, dust, Dexter's missing poses, menu and loading art), readability fixes, the asset inventory |

`game/src/core/scaffold.ts` (`Stage`) and `game/src/main.ts` are shared: change only the lines your workstream needs, keep them small, and say so in the PR.

## Contracts between workstreams

```mermaid
flowchart TD
  subgraph data["per region (art/stages/hidden-garden)"]
    SJ["stage.json<br/>layers: id, z 0–7, scroll, file"]
    CJ["*.collision.json<br/>walk / interact / spawn"]
    AJ["atmosphere.json (2)<br/>wind per layer, leaves,<br/>water band, blur"]
    SF["surfaces.json (3)<br/>x ranges → grass / mud / stone / wood"]
  end
  L1["(1) loader<br/>loads everything once"] --> R2["(2) renderer + atmosphere"]
  L1 --> H3["(3) hero"]
  L1 --> P4["(4) prologue"]
  SJ --> R2
  AJ --> R2
  SF --> H3
  CJ --> H3
  CJ --> P4
  H3 -->|"hero sprite depth = HERO_DEPTH"| R2
  P4 -->|"trigger-entered, swapRegion"| L1
```

- **Depth bands** (Phaser depth, `game/src/stage/depth.ts`, owned by 2): layers z 0–5 below `HERO_DEPTH = 100`; actors 99–110 (props 99, hero 100, NPCs 101–105); z 6–7 foreground layers at 200+; screen FX and HUD above. In code: `PROP_DEPTH 99`, `HERO_DEPTH 100`, `NPC_DEPTH {101–105}`, `ACTOR_FX_DEPTH 110`, `LEAVES_BEHIND_DEPTH 90`, `LEAVES_FRONT_DEPTH 150`, `NEAR_DEPTH 120` (z 6: the grass strip in front of the trail, over the actors' feet), `FOREGROUND_DEPTH 200` (z 7), `SCREEN_FX_DEPTH 1000`. A layer's depth is its band plus its region-wide rank (`layerRanks`), so a chunk that lists fewer layers stacks like the others.
- **Stage handles** (2): `drawStage(scene, manifest, state, atmosphere?)` returns `{ images, layers, atmosphere, leaves, animated, waterlineAt(x), reflect(sprite), reveal(position, ms), destroy }`. `reflect` mirrors an actor in the water (Stage does it for the hero); `addRim(sprite, colour?, strength?)` (`stage/atmosphere/pipeline.ts`) gives any sprite a 1 px warm inner rim (Dexter on the dark hedge). On `anomaly-reveal` the water shows `atmosphere.water.wrong`; `stage.data.get('water-reveal')` is true when it will. Schema: [docs/09 – Atmosphere](09-ART-PIPELINE.md#atmosphere--a-stage-that-moves-atmospherejson).
- **Loader** (1): `Preload` loads every atlas in `BOARDS` plus the region's stage, collision, atmosphere and surfaces files, then starts `Stage` with `{ manifest, state, collisions, atmosphere, surfaces, spawn }`. Story and UI scenes never load assets themselves; they create animations lazily (`story/atlases.ts`).
- **Events** (`game/src/core/events.ts`): `trigger-entered`, `region-turned`, `save`, `enemy-defeated`, `boss-defeated`; the prologue adds `quest` events if it needs them – a new event goes in a small separate commit.
- **Region swap**: `swapRegion(scene, { region, state, spawn? })` (`stage/swap.ts`).
- **Dev handle**: `window.game` in dev builds for checks.

## The loader contract (workstream 1)

`game/src/boot/` holds the only two scenes that load files. **Boot** draws the pixel font in code and loads the UI atlas + `ui-layout.json`; **Preload** loads a region behind the loading screen and starts **Title** (first load) or **Stage** (a region swap).

```mermaid
flowchart LR
  B["Boot<br/>pixel font, UI atlas"] --> P["Preload<br/>{region?, state?, spawn?}"]
  P --> W0["stage.json"] --> W1["wave 1 JSON (fetch)<br/>atmosphere, surfaces, board JSON,<br/>map stages"] --> W2["wave 2 (Phaser loader)<br/>collision, plates, board sheets,<br/>menu-key.png"]
  W2 -->|"no errors"| D{"first load?"}
  W2 -->|"required file failed"| E["Retry [R] / Continue [C]<br/>production: 1 auto-retry,<br/>then continues in 6 s"] --> D
  D -->|yes| T["Title<br/>key art ↔ live garden"] -->|Start: crossfade| S["Stage"]
  D -->|"no (swapRegion)"| S
```

- **What loads:** every atlas in [`game/src/stage/boards.json`](../game/src/stage/boards.json) (`required` falls back to a placeholder, `optional` may be absent) – add a board with one line there; the region's `stage.json`, its collision files and plates; the optional `atmosphere.json` and `surfaces.json` from `game/public/assets/stages/<region>/` (absent → `{}`; `scripts/export_stage.py` must copy them from `art/stages/<region>/`); every region's `stage.json` for the map (`map-stage-<region>`); `ui/menu-key.png` (optional).
- **What Stage receives** (`game/src/boot/contract.ts` `StageData`): `{ manifest, state, collisions, atmosphere, surfaces, spawn? }` – `atmosphere` and `surfaces` are plain objects, parsed by their owners (2, 3).
- **Caches:** atlases by board id (`dexter`, `fx-leaves`, …), clips in the JSON cache as `<board>.anims`, plates as `<region>:<file>`, UI as `ui` / `ui-layout`. Scenes read these; they never call `this.load`.
- **Never hangs:** JSON requests time out after 20 s, a dev server's HTML fallback counts as missing, a wave with no byte moving for 25 s gives up, and every failure lands on screen. A region swap reloads only what the new region adds.
- **Dev checks:** `window.game.scene.getScene('Preload').tracker.summary()`; `?skip-menu` goes straight to the stage.

| Loading | Menu (key art) | Menu (live garden) |
| --- | --- | --- |
| ![The loading screen mid-way](images/boot-loading.png) | ![The menu over the key art](images/boot-menu-key-art.png) | ![The menu over the live garden](images/boot-menu-live-garden.png) |

## Rules for every workstream

- Branch `feature/<issue or slice>-<topic>` from `slice/prologue`; PR (ready for review, not a draft) **into `slice/prologue`**, with a mermaid diagram, before/after evidence (screenshot, GIF or `compare.py`), and how to test. Never push to main or to another workstream's branch; never merge.
- Commit as `arudaev <hlexhelftd@gmail.com>`, Conventional, no AI attribution. Before pushing: `npm --prefix game run typecheck`, `npx vitest run` (in `game/`), `npm --prefix game run build`; script tests `cd scripts && python -m pytest -q`; `python scripts/check_docs.py` (delete `game/public/assets/stages` first, then run `python scripts/export_stage.py` from `game/` again before playing).
- Art only through the pipeline: `make_boards.py` with `gpt-image-2.5-sunburst`, real references (photos in `~/Downloads/GameJam_*`, `repo:` crops of `art/direction`), magenta key, no text; `export_atlas.py`. The key is read from `.env` (copy the main checkout's `.env` into your worktree; never commit it, never put the key on a command line).
- Sizes from the art (decision 41), mechanics from the art (decision 43). Data in files, not constants in code.
- Windows: never `X.ts` next to `x.ts`; never a `node_modules` junction – run `npm ci` in your worktree.

## Wave 2 – Alexander's playtest (Sat 24 Oct ~06:45)

What the first build got wrong, in his words' order, and the workstream that owns each fix:

| # | Found in play | Fix | Workstream |
| --- | --- | --- | --- |
| P1 | We walk on water, on planks and stairs as if they were hills (and slide), fall through where a log or a wall should stop us, "climb" a log instead of jumping it; the path's edges are guessed | A **terrain system**: every walkable surface authored from the art as a *trail band* with typed segments (ground, step, ledge, wall, plank, stair, log, water = never walkable); step-ups under ~16 px, ledges you must jump, walls that stop you; chunk ends that continue | 6 terrain |
| P2 | It feels like walking *on top of* the world; no grass at the feet | The **hot-dog layering**: far background → far greenery → near greenery → the trail (where you walk) → a grass/plants strip *in front of the trail* that covers the feet → water, rocks → blurred close leaves. The trail carries surface effects (slippery, particles per material) | 7 layers + 6 terrain – **layers done** (`feature/slice-layers`): bands sky · far · mid · rear · water · trail · near strip (z 6, `NEAR_DEPTH` 120) · foreground; trail geometry unchanged |
| P3 | The cut-outs show: leaves, water edges and trees line up wrongly as the layers move | Every layer **rendered complete**: the parts hidden behind nearer layers are painted in (gpt-image-2.5 inpainting per plate), edges cleaned, more bands where the depth needs them | 7 layers – **done** (`feature/slice-layers`): far and mid painted whole, water/path/rear filled behind the foreground and the strip, hanging canopies painted out, sky cross-faded ([docs/09](09-ART-PIPELINE.md#every-plate-complete--the-hot-dog-docs15-p2-p3)) |
| P4 | You outrun Dexter; you spawn left of the entrance while he waits at it | Dexter **leads at the hero's pace** – never overtaken, hops ahead when you close in; the hero starts at the entrance. **In review: [#171](https://github.com/THD-AI/WinCS/pull/171)** – 4-plush lead, hop ahead inside 3, sprint 1.35 × the run; waits only for a lagging hero; spawn in the gate (hg-0-0 x 205); wake from x 420 with a bow | 8 Dexter |
| P5 | After the 404 you land on the railway bridge; the cement road under it is gone; two pushes in a row (from behind, then Jenny from the front) confuse | Land on the **creek path**, the cement road under the rail bridge (the clean art has it); Jenny's ram reads as one clear event on that path; the region swap explains itself | 9 Region 1 – done in `feature/slice-region1` (landing on the path, one-event ram, crash crossing); the walk line on the path is provisional for 6 |
| P6 | The hero's movement is fidgety in Rusty Creek; jump-spam feels slow and buggy; idles are stiff | **Hero motion polish**: find the creek jitter (sink/slope/stride on steel), fix jump buffering under spam, more idle life (breathing, poncho sway) | 10 hero motion – draft #172: the jitter was the creek's deck seams (every 10–50 px step = fall, landing, run-start from a stand: 24 → 5 off-cycle frames per step); 1-frame crouch, tap hop apex 0.29 → 0.18 s; breath + gust sway. The step-*up* gaps (rc-0-0 x≈1488, rc-2-0 x≈5260) that reset the hero are left to 6 |
| P7 | The chair pops in, no idea how to attack; one rover and then nothing | A **pickup moment** (the hero picks it up, a wordless key/button glyph shows the attack); more encounters along the route | 9 Region 1 – done in `feature/slice-region1` (pick-up clip, glint, J/X glyph; 7 rovers, crab, drone) |
| P8 | Jenny drives through you – no knockback, nothing happens; parts just fall; unclear how to hurt her | **Jenny reads**: real knockback, a clear tell, a glowing open back while stunned, hit flashes and screen shake, parts that bounce and threaten | 9 Region 1 – done in `feature/slice-region1` (throw + brake, rev tell, open back, hit flash/shake/spark, clank, bouncing parts) |

| # | Workstream | Owns |
| --- | --- | --- |
| 6 | Terrain and walkability | `game/src/player/body.ts`, `traversal.ts`, `game/src/stage/collision*.ts`, the walk/solid/oneWay/noGo geometry of `art/stages/*/*.collision.json` (not interact/spawn), `surfaces.json`, `scripts/collision_*.py` |
| 7 | Layers rendered complete | `art/stages/hidden-garden/` layers, masks, `export.json`, `layers.json`, `atmosphere.json`, `scripts/depth_layers.py`, `grow_stage.py` |
| 8 | Dexter and the prologue's staging | `game/src/story/Prologue*.ts`, `prologueGuide.ts`, `prologueFinale.ts`, hidden-garden `interact`/`spawn` entries |
| 9 | Region 1: landing, ram, chair, encounters, Jenny | `game/src/story/Flow.ts`, `game/src/enemies/`, `game/src/combat/chairPickup.ts`, rusty-creek `interact`/`spawn` entries, HUD glyphs |
| 10 | Hero motion | `game/src/player/animation.ts`, `grounding.ts`, `jump.ts`, `footfall.ts`, `hurt.ts`, hero idle art if needed |

<!-- nav:start -->
[← 13 – Production pipeline](13-PRODUCTION-PIPELINE.md) · [Design docs](README.md) · **14 / 15** · [Meetings and voice notes →](meetings/README.md)
<!-- nav:end -->
