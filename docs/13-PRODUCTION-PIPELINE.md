# 13 – Production pipeline

<!-- nav:start -->
[← 12 – Team workflow](12-TEAM-WORKFLOW.md) · [Design docs](README.md) · **13 / 16** · [15 – The prologue slice (rebuild) →](15-PROLOGUE-SLICE.md)
<!-- nav:end -->

How every image, layer, sprite, animation, stage and collision box gets from a photo to the game, and how two AI agents build it in parallel without stepping on each other. The *what* is in [07 – Asset manifest](07-ASSET-MANIFEST.md) and the *how to prompt* in [09 – Art pipeline](09-ART-PIPELINE.md); this page is the order of work, the hand-over formats and the lanes. Every box in the diagrams names the issue that delivers it.

## The two lanes

> **Since 24 Oct, one owner** ([decision 42](11-DECISIONS.md)). Codex has stopped (no credits left); Alexander + Claude own both columns below, which stay as the map of modules and folders. Codex's stack #111 → #149 is the base for the systems and is reworked on top where it misses the art ([#156](https://github.com/THD-AI/WinCS/issues/156)); the merge plan is [#161](https://github.com/THD-AI/WinCS/issues/161). The rules in §6 about not touching the other lane's stacks no longer apply.

| | Lane A – art and integration | Lane B – game code |
| --- | --- | --- |
| Person | Alexander ([arudaev](https://github.com/arudaev)) | Vatsal ([Vatsal2005](https://github.com/Vatsal2005)) |
| Agent | Claude, **with** the OpenAI API (`OPENAI_API_KEY` in `.env`) | Codex, **without** an OpenAI key |
| Owns | `scripts/`, `art/`, `game/public/assets/`, `game/src/scenes/`, `game/src/story/`, `game/src/ui/`, `game/src/fx/` (atmosphere, anomaly effects), deploy | `game/` scaffold and config, `game/src/core/`, `game/src/player/`, `game/src/combat/`, `game/src/enemies/`, `game/src/stage/` |
| Makes | Every image: direction, concepts, chunks, layers, sprite sheets, atlases | Every system: movement, collision, combat, enemies, bosses, region swap |
| Never | Pushes to lane B's open stacks (finished work may be corrected – [AGENTS.md rule 6](../AGENTS.md#reference-fidelity--every-agent-every-change-you-can-see)) | Generates or commits art; edits `art/` or `scripts/make_boards.py` |

**Both lanes follow [reference fidelity](../AGENTS.md#reference-fidelity--every-agent-every-change-you-can-see):** plan with a diagram, measure every size, ratio and position against `art/` and the docs' numbers, and prove it with a `scripts/compare.py` comparison in the PR.

**Lex** owns collision and encounters: the Tiled files and `*.collision.json` in `art/stages/`, and the beat placement. **Only lane A generates art.** One generator, one style master and one review keep the game in one style; Codex's own image generation would drift from the approved direction. Lane B uses **placeholders** until the real art lands: coloured rectangles at the documented sizes, loaded through the same contracts, kept in `game/public/assets/placeholder/` and never in `art/`.

## The whole pipeline

```mermaid
flowchart LR
  P[Photos and references<br/>WINCS_PHOTOS, outside Git] --> D[Direction pack<br/>art/direction ✅]
  D --> C[Stage concepts<br/>clean + anomaly ✅]
  D --> H[Hero sheet ✅]
  C --> K[Chunks 2160×720]
  K --> L[Layer split<br/>z0–z7]
  L --> A[Collision annotation<br/>Lex, Tiled]
  H --> B[Sprite boards]
  B --> X[Atlases + animations]
  L --> G[game/public/assets]
  A --> G
  X --> G
  G --> R[Game runtime<br/>Phaser]
  R --> V[Vercel preview]
```

Nothing moves right until its stage is approved: direction before sprites, concepts before chunks, Design review before export.

## 1 · Image generation and processing (lane A)

One loop for every image, whether it is a direction image, a stage concept, a chunk or a sprite board ([09](09-ART-PIPELINE.md)).

```mermaid
flowchart TB
  CFG["Config entry in art/**/*.json<br/>brief, inputs, size, keyed?"] --> IN[Resolve inputs<br/>photos via WINCS_PHOTOS,<br/>approved art via repo: paths]
  IN --> PR[Prompt = brief, then style, then people rule<br/>no title line]
  PR --> API[OpenAI images/edits<br/>gpt-image-2.5-sunburst]
  API --> RAW[tmp/boards/&lt;set&gt;/raw/&lt;id&gt;.png<br/>outside Git]
  RAW --> CR[crush: magenta key at full size →<br/>premultiplied ×2 downscale →<br/>96 colours → alpha threshold]
  CR --> OUT[art/&lt;set&gt;/images/&lt;id&gt;.png<br/>+ &lt;id&gt;-preview.png]
  OUT --> PG[pages: review page per image]
  PG --> RV{Design review<br/>on the board}
  RV -- Changes needed --> CFG
  RV -- Approved --> NEXT[Next stage may use it as an input]
```

```bash
python scripts/make_boards.py draw  <ids> --config art/sprites/boards.json   # lane A only (API)
python scripts/make_boards.py crush <ids> --config art/sprites/boards.json   # offline, anyone
python scripts/make_boards.py pages --config art/sprites/boards.json         # offline, anyone
```

`draw` is the only step that needs the API key. `crush` and `pages` rebuild every committed image from raws offline, so lane B can always regenerate what it sees.

## 2 · Characters, attacks and animations

```mermaid
flowchart TB
  HS[Hero sheet ✅ locked] --> BRD
  POSE[Pose and object photos<br/>chair, tray, merch, robots] --> BRD
  SM[Style master ✅] --> BRD
  BRD["Sprite board per animation group<br/>key poses on one sheet, one generation"] --> CRU[crush + review page<br/>looping preview at 80 px]
  CRU --> DR{Design review}
  DR -- Changes needed --> BRD
  DR -- Approved --> EXP["export_atlas.py → atlas png + json<br/>+ &lt;board&gt;.anims.json (M0-S4 #61)"]
  EXP --> LOAD["Loader M0-S5 #24"]
  LOAD --> SMN["Animation state machine M1-S9 #31<br/>12 fps stepped, switch on contact frames"]
```

Every sheet, in the order the game needs them:

| Sheet | Animations (frames) | Issue | Unblocks |
| --- | --- | --- | --- |
| `hero-move`, `hero-run`, `hero-idle`, `hero-air` | idle 6 + 3 variants · walk 8 · run start 3 · run 8 · idle→walk 2 · walk→run 2 · jump 9 · fall 3 · hard landing 4 · ladder 4 | [M1-S8 #60](https://github.com/THD-AI/WinCS/issues/60) | movement feel, M1 |
| `hero-hurt`, `hero-death` | hit 8 · knockback 3 · death 12 · interact 3 · pick up 4 · look at device 3 | [M2-S12 #83](https://github.com/THD-AI/WinCS/issues/83) | damage, the THD.exe crossing |
| `chair-side`, `chair-overhead`, `chair-block` | sweep A 8 · sweep B 8 · recoil 2 · up 6 · slam 7 · pogo 4 · guard up 4 · hold 3 · impact 4 · break 4 | [M2-S10 #81](https://github.com/THD-AI/WinCS/issues/81) | combat |
| `enemy-rover`, `enemy-crab`, `enemy-drone`, `fx` | rover 4/6/4/5 · crab 4/8/5/5 · drone 4/3/5/3 · black fluid 6 | [M2-S11 #82](https://github.com/THD-AI/WinCS/issues/82) | enemies |
| `mensa-food`, `mensa-drinks` | food 4 × 1 frame, 13–18 px (sparkle in code) · drink icons | [M2-S13 #84](https://github.com/THD-AI/WinCS/issues/84) | healing |
| `coffee-machine` | idle 3 · pour 4, 80 px | inside [M4-S4 #52](https://github.com/THD-AI/WinCS/issues/52) | save points |
| `dexter`, `dexter-acts` | idle 3 · hop 4 · walk 6 · point 3 · shove 4 · beckon 3 · bow · sweat · proud · creepy shadow · absorb 4 | [M3-S5 #86](https://github.com/THD-AI/WinCS/issues/86) | prologue, Region 1 beats |
| `boss-jenny`, `boss-jenny-2` | rev 4 · charge 4 · crash 4 · stunned 3 · reboot 2 · debris ×5 | [M4-S6 #87](https://github.com/THD-AI/WinCS/issues/87) | the boss |
| `pocket-computer` | bob 4 · open 3 (screens: UI atlas) | inside [M4-S4 #52](https://github.com/THD-AI/WinCS/issues/52) | menu, map |

Frames are drawn as **key poses**, never interpolated by the model; transitions are short bridge clips that start and end on poses shared with the loops ([09 – Smooth, not rubbery](09-ART-PIPELINE.md#smooth-not-rubbery)).

## 3 · Stages: chunks, layers, four directions

```mermaid
flowchart TB
  CON["Stage concept, clean + anomaly ✅<br/>art/locations"] --> SK[Lex's route sketch<br/>entry, branches, secrets, boss room]
  SK --> GRID["Chunk grid with ids<br/>rc-0-0, rc-1-0, rc-1--1 …"]
  GRID --> CH[Compose chunk 2160×720<br/>concept + neighbours as inputs]
  CH --> NB["Neighbour chunk up/down/left/right<br/>make_boards.py neighbour --dir (M0-S8 #63)"]
  CH --> TR["Transition chunk: surface ↔ underground,<br/>outside ↔ inside, both neighbours as context"]
  NB --> SEAM["Seam repair, protected pixels<br/>stage_art.py (M0-S7 #62 for up/down)"]
  TR --> SEAM
  SEAM --> SPLIT["Layer split z0–z7, recomposition<br/>verified pixel-exact (M0-S6 #64)"]
  SPLIT --> ANOM[Anomaly state: replace only the<br/>layers that change, usually z3 + z5]
  ANOM --> EXPS["Export to game/public/assets/stages/&lt;region&gt;<br/>+ stage.json manifest"]
```

The layer stack every chunk follows ([04 – Layers](04-WORLD-AND-LEVELS.md#layers--what-goes-over-what)):

```mermaid
flowchart LR
  z0[z0 sky 0.1] --> z1[z1 far 0.25] --> z2[z2 mid 0.6] --> z3[z3 rear structure 1.0] --> z4[z4 water + reflection 1.0] --> z5[z5 PLAY LAYER 1.0<br/>collision lives here] --> z6[z6 near props 1.0] --> z7[z7 foreground blur 1.2] --> z8[z8 particles<br/>game] --> z9[z9 anomaly FX<br/>shader]
```

z0–z7 are painted PNGs; z8 and z9 are made by the game. Shared layers (sky, far trees, water) are stored once and aliased.

## 4 · Collision, interactables, ladders and stairs (Lex)

```mermaid
flowchart LR
  PLAY[z5 play layer +<br/>composed chunk as background] --> TIL["Tiled map, one per chunk and state<br/>object layers named after the legend"]
  TIL --> CONV["collision_from_tiled.py (M1-S10 #92)"]
  CONV --> CJ["art/stages/&lt;region&gt;/&lt;chunk&gt;.&lt;state&gt;.collision.json"]
  CJ --> LD["Loader + debug overlay (M1-S6 #34)"]
  LD --> PHY[Ground polylines, boxes, triggers<br/>in the game]
```

Draw every object in **stage pixels** on top of the 2160×720 chunk, one Tiled object layer per kind:

| Layer | Shape | Draw it for |
| --- | --- | --- |
| `walk` | polyline | ground and gentle slopes ≤ 40°, girder tops you stand on |
| `slide` | polyline | slopes > 40° you skid down |
| `one-way` | polyline | decks, planks, scaffold boards: jump up through, ↓ + Jump drops |
| `climb` | box + `kind` | **ladders, vines, scaffold** – stairs are flat walk treads (rises ≤ 16 px are stepped; docs/04 terrain model), never slopes and never steps of boxes |
| `solid` | box | walls and ceilings |
| `no-go` | box | out of bounds, deep water: reset without damage |
| `hazard` | box + `damage` | current, sap, sparks |
| `interact` | box + `kind` + `id` | coffee machine, pickup, Dexter, sign, **the anomaly**, boss gate, chunk exit |
| `spawn` | point + `kind` + `id` | player, rover, crab, drone, item, Dexter |
| `ledge` | point | reserved (pull-up is cut for the jam) |
| `glide-lift` | box | reserved (glide is Region 2) |

### Contract: `collision.json`

```json
{
  "chunk": "rc-0-0",
  "state": "anomaly",
  "size": [2160, 720],
  "walk": [[[0, 612], [340, 600], [520, 560]]],
  "slide": [],
  "oneWay": [[[700, 420], [960, 420]]],
  "climb": [{"id": "ladder-1", "kind": "ladder", "x": 980, "y": 300, "w": 26, "h": 300}],
  "solid": [{"x": 2140, "y": 0, "w": 20, "h": 720}],
  "noGo": [],
  "hazard": [{"x": 1200, "y": 690, "w": 300, "h": 30, "damage": 1}],
  "interact": [{"id": "coffee-1", "kind": "coffee-machine", "x": 1500, "y": 520, "w": 40, "h": 80}],
  "spawn": [{"id": "player", "kind": "player", "x": 120, "y": 600}, {"id": "rover-1", "kind": "rover", "x": 760, "y": 410}],
  "ledge": [],
  "glideLift": []
}
```

Coordinates are integers in stage pixels, origin top left; polylines run left to right; `kind` values are lower-case with dashes. Adding a field is fine; renaming one needs both lanes to agree in an issue.

Optional `terrain` (docs/04 terrain model): `[{"x": [x0, x1], "y": [y0, y1]?, "kind": "ground|step|stair|plank|ledge|wall|log|obstacle|slide", "material": "<surfaces.json material>", "note"?}]` – chunk-local ranges, first match wins, every walk/oneWay/slide segment covered. Solids take an optional `kind` (`wall`, `log`, `obstacle`), no-go boxes `kind: "water"`. A chunk with `terrain` was re-authored by hand: `depth_layers.py collision` keeps its floors.

## 5 · The other hand-over contracts

Lane B codes against these from day one, with placeholders; lane A fills them with real art. Neither lane changes a contract alone.

| Contract | Path | Shape | Made by → used by |
| --- | --- | --- | --- |
| Atlas | `game/public/assets/sprites/<board>.png` + `.json` | Phaser JSON hash; frame names `<animation>-<nn>` from `00`, one cell size per board; pivot at the feet (0.5, 1) | `export_atlas.py` (A) → loader (B) |
| Animations | `game/public/assets/sprites/<board>.anims.json` | `{"walk": {"frames": 8, "fps": 12, "loop": true}, …}` – names and counts as in docs/07 | `export_atlas.py` (A) → state machine (B) |
| Stage manifest | `game/public/assets/stages/<region>/stage.json` (generated by `scripts/export_stage.py`, not committed) | `{"region", "chunkSize": [2160, 720], "chunks": [{"id": "rc-0-0", "x": 0, "y": 0, "states": {"anomaly": {"layers": [{"id", "z", "scroll", "file"}], "collision": "rc-0-0.anomaly.collision.json"}}}]}`. Draw the layers **in list order** (Rusty Creek's soft water goes last); `z` names the docs/04 role. Files sit next to the manifest | stage export (A) → loader (B) |
| Collision | `art/stages/<region>/<chunk>.<state>.collision.json`, chunk ids `<prefix>-<column>-<row>` | above; checked by `collision_check.py` | A (Tiled + converter, or by hand) → loader (B) |
| Region swap | `game/src/stage/swap.ts` | `swapRegion(scene, { region, state, spawn? })` emits `region-turned` and reloads the stage; the slice starts at `START` (Hidden Garden, clean) | story (A) calls it on a crossing's cut |
| Game events | `game/src/core/events.ts` | typed events: `enemy-defeated`, `player-hit`, `player-died`, `region-turned`, `boss-defeated`, `save`, `trigger-entered` (the hero entered an `interact` box) | combat and enemies (B) emit → story and UI (A) listen |
| Placeholder sizes | – | hero 28×76 body in an 80 px frame; Dexter 27 px; rover ≈ 25 px; crab ≈ 40 px; drone ≈ 45 px; Jenny ≈ 270×95 (body; wing and beacon above) | docs/04 scale table |

## 6 · Two agents, one repo

```mermaid
sequenceDiagram
  participant A as Lane A · Alexander + Claude (OpenAI)
  participant M as main
  participant B as Lane B · Vatsal + Codex
  participant L as Lex
  B->>M: M0-S1 scaffold, core/events.ts, placeholders
  A->>M: M0-S4 export_atlas + contracts
  L->>M: M1-S7 Rusty Creek collision (Tiled → json)
  par art
    A->>A: draw → crush → Design review → export sheets
  and code
    B->>B: movement, collision, combat against placeholders
  end
  A->>M: art PRs (sprites, chunks, atlases)
  B->>M: code PRs (one story each)
  M-->>A: merge main into open branches
  M-->>B: merge main into open branches
  A->>M: integration: scenes, story beats, HUD
```

The rules both agents follow:

1. **Start from an issue assigned to your person.** Read it, this page, and the doc sections it links. No issue, no branch.
2. **Stay in your lane's folders** (table at the top). Need something in the other lane? Comment on its issue or open a new one with the bug or task form – don't edit it.
3. **Branch** `<type>/<issue>-<slug>` from `main`; open a **draft PR** at the first push with `Closes #<issue>`.
4. **Stack** only inside your own lane: `[1/3] …` on `main`, `[2/3]` on the branch below, and so on ([CONTRIBUTING – Stacked PRs](../CONTRIBUTING.md#stacked-prs)). Never base a PR on the other lane's branch; wait for it to reach `main`.
5. **Sync with `main`** after every merge you see on the board: `git fetch && git merge origin/main` into each open branch, bottom of the stack first. Merge, don't rebase, once a PR is open.
6. **Shared files** – `game/package.json`, `game/src/main.ts`, `game/src/core/events.ts`, the contracts above – change only in a small PR of their own, titled `chore(shared): …`, merged before anything that depends on it.
7. **Art enters the game only through `export_atlas.py` and the stage export**, never by copying images into `game/`.
8. **Merging** is done by a person, bottom of each stack first, after someone played the Vercel preview. Agents never merge, never push to `main`, never `/take`.

```mermaid
gitGraph
  commit id: "main"
  branch "chore/22-scaffold"
  commit id: "B: scaffold"
  checkout main
  merge "chore/22-scaffold"
  branch "chore/61-export-atlas"
  commit id: "A: export_atlas"
  checkout main
  branch "feature/27-walk-and-run"
  commit id: "B: walk + run"
  checkout main
  merge "chore/61-export-atlas"
  checkout "feature/27-walk-and-run"
  merge main id: "B syncs main"
  branch "feature/28-jump"
  commit id: "B: jump (stacked)"
  checkout main
  merge "feature/27-walk-and-run"
```

## Who does what next

From 24 Oct everything is Alexander + Claude ([decision 42](11-DECISIONS.md)). The order to the jury (Sat 11:30), each an issue on the board:

```mermaid
flowchart LR
  M["#161 merge plan<br/>Codex stack → main"] --> F["#156 movement + combat feel<br/>timing from anims.json,<br/>speeds from the art"]
  M --> R["#35 / #155 route<br/>garden → creek → maze"]
  R --> J["#57 Jenny's fight<br/>→ boss-defeated → ending"]
  A["#158 asset system<br/>inventory → generate → check"] --> L["#159 readable at 1x"]
  A --> C["#157 Region 1 rebuilt<br/>from the direction"]
  S["#160 story arc"] --> J
  F --> P["#73 playtest"]
  J --> P
  C --> P
  P --> D["#74 freeze + deploy → #75 demo"]
```

<!-- nav:start -->
[← 12 – Team workflow](12-TEAM-WORKFLOW.md) · [Design docs](README.md) · **13 / 16** · [15 – The prologue slice (rebuild) →](15-PROLOGUE-SLICE.md)
<!-- nav:end -->
