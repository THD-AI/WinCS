# 09 – Art pipeline

<!-- nav:start -->
[← 08 – Tech stack and where things live](08-TECH-STACK.md) · [Design docs](README.md) · **9 / 14** · [10 – Jam plan →](10-JAM-PLAN.md)
<!-- nav:end -->

![Rusty Creek – seven registered layers composed](../art/stages/rusty-creek/images/after-center.png)

One rule above everything: **every image comes from real references through a rerunnable script and a config.** No hand-saved images from a chat window, and no text-only prompts. The configs live next to their outputs (`art/**/*.json`), and every image has a Markdown page with its brief, inputs and review.

```
photos (Drive, outside Git) ──┐
approved art (art/)          ─┼─▶ config + brief ─▶ scripts/*.py ─▶ tmp/ raw ─▶ review ─▶ crush / split / verify ─▶ art/ (committed)
reference games (references/)─┘                                          ▲            │
                                                                         └── redo ◀───┘ (rejected takes stay in tmp/…/rejected)
```

## The order – never skip a step

| # | Step | Output | Tool |
| --- | --- | --- | --- |
| 1 | **Collage** – our photos of the real place | `references/campus/` | earlier pass |
| 2 | **Direction** – the look, one style master, everything drawn from it | `art/direction/` | `make_boards.py --config art/direction/direction.json` |
| 3 | **Stage concept** – the region in its clean and anomaly states, with routes up and down | `art/locations/` | `make_boards.py --config art/locations/locations.json` |
| 4 | **Lex's route sketch** on top of the concept: chunks, branches, secrets, enemies, boss room | sketch + chunk list | by hand |
| 5 | **Chunks** – a clean side-view banner per chunk, then neighbours left, right, up, down | `art/stages/<region>/sources/` | generation + `stage_art.py prepare/apply` |
| 6 | **Layers** – split the composed chunk into the registered layer stack ([04](04-WORLD-AND-LEVELS.md)) | `art/stages/<region>/images/` | `creek_layers.py`-style script per region |
| 7 | **Annotation** – walkable lines, slides, ledges, climb zones, solids, hazards, interactables, spawns | `<chunk>.<state>.collision.json` | by hand in Tiled (Lex), then `collision_from_tiled.py` |
| 8 | **Sprites** – boards per character/enemy/item, drawn with the hero sheet and the style master | `art/sprites/` | `make_boards.py` |
| 9 | **Export** – atlases and plates the game loads | `game/public/assets/` | `export_atlas.py` |

## Growing a stage in four directions

What Codex's runs proved on Rusty Creek, generalised:

1. **Scene first, then masks.** Generate the whole chunk as one picture, repair it, and only *then* derive the layers from it by masks. Each layer redrawn on its own drifts (Codex's first combined study did exactly that and was replaced).
2. **Neighbours from the edge.** A new chunk starts from the neighbour's edge band as context (same 2160×720 size): a right neighbour sees the left chunk's right band, an upper neighbour sees the chunk's top band, and so on. The original chunk is never redrawn.
3. **Repair only the join.** `stage_art.py prepare` cuts a join window across the seam (512 px), the model repairs only that band, and `apply` copies back just that band and checks that every protected pixel outside it is unchanged. Left/right join windows are implemented today; **up/down join windows** use the same code on rotated bands (an issue on the board).
4. **Stable chunk IDs, recomputed origins.** Chunks are addressed by grid ID (`x,y`); inserting one in the middle recomputes positions, never the source images.
5. **Shared scenery is stored once.** Layers that repeat (sky, far trees, water) are aliases, not copies.
6. **Transition chunks** join different spaces – surface to underground, outside to the Mensa inside. They are generated with *both* neighbours as context and blend the two layer stacks over their height.
7. **Clean and anomaly share everything they can.** The anomaly state replaces only the layers that change (on Rusty Creek, only the structure layers). Masters are rebuilt from the plates and verified pixel-exact (`creek_layers.py`).

## Prompting lessons (23 Oct, all runs)

| What we tried | What happened | Rule now |
| --- | --- | --- |
| Style text before the brief | Painted a scene instead of a sheet | Brief first, style after |
| A whole stage plate as a "style sample" | Redrew the stage | Never pass a full scene as a style sample |
| `gpt-image-2.5-flare` | Ignored layouts | `sunburst` only |
| Pose photos with people, no hero sheet first | Drew the photographed teammate | Hero sheet is always first (sprites) or second (scenes) |
| A collage as the main input | Redrew the collage – panels, labels, perspective | Use the raw photos, plus an approved flat image as format anchor |
| A direction image as input for a background | Copied its characters | Backgrounds: no character images as inputs |
| A title line ("BOARD: …") in the prompt | Printed it into the image as a sign | No titles in prompts |
| "No perspective" alone | Corridors and paths still receded | Say "architect's elevation, everything parallel to the screen" |
| Wallpaper extension of strips | Looked like repeated wallpaper, no gameplay | Grow chunks only where Lex's route needs them, via join repairs |
| Many figures in one lineup | Wrong scales, missing figures | At most ~5 figures per image |
| 15-min timeout, key on the command line | Timeouts; the key printed in a traceback | 30-min limit, key via a header file |
| Photorealistic mannequin collages (Codex) | Pointless for sprites | Pixel art from the start, our hero in every pose |
| Perspective repaints of photos (Codex) | Rejected | Flat side elevation only |

## Sprite boards

`art/sprites/boards.json`: the hero sheet (locked) comes first, the pose or object photos follow, and the style master goes last. The model draws on a flat magenta key. `crush` keys the magenta at full size, downscales ×2 with premultiplied alpha (so no purple fringes), quantises to 96 colours, and writes a transparent 1× PNG plus a readable preview. Chair photos are split into **block**, **overhead/up-down** and **side** sequences by file name. Every board stays "to do" until the direction is approved; see [07](07-ASSET-MANIFEST.md).

Every animation board gets an `atlas` entry when it is drawn, because the review preview is cut with it. Export into the game only once its Design review is **Approved**. `rows` lists the board's rows of sprites from top to bottom: the animations in each row, left to right, with their frame counts from [07](07-ASSET-MANIFEST.md), or `"skip"` for a row that isn't exported (close-ups, scale lineups). `height` is the game height in pixels of the tallest frame of the first animation; the hero's is 76, in an 80 px frame. When the first animation has no standing pose (a jump), `"ref": "jump-08"` names the frame that is 76 px instead. An animation may continue at the start of the next row (death 6 + 6: list it again with the rest of its frames). `"even": true` keeps a row's specks and cuts it along seams without the weight check, for frames that break into dust. `"float": true` on an animation drawn in the air (jump, fall) puts each frame's lowest pixel on the baseline, because the game already lifts the body. `fps` defaults to 12 and `loop` to true. A sheet holds at most about 30 frames in four rows; the model miscounts bigger sheets, so split them (`hero-move`, `hero-run`, `hero-idle`). Open every brief with the magenta background and the no-text rule: put later in the brief, the model sometimes draws on paper with captions.

```json
"atlas": {"height": 76, "rows": [
  [{"anim": "idle", "frames": 6}],
  [{"anim": "walk", "frames": 8}, {"anim": "idle-walk", "frames": 2, "loop": false}],
  "skip"]}
```

`export_atlas.py` cuts each row into frames at the empty columns, or along winding seams where neighbours overlap (a foot under the next poncho). It **stops** if a row has more or fewer figures than its config lists, so a model that drew 7 walk frames instead of 8 is caught before the game sees it. It scales the whole board by one factor, puts every frame's feet on the bottom row of its cell (frames drawn in the air keep that height unless the animation floats), centres the pivot under the torso so walk and run cycles don't slide, and writes the atlas, its JSON and `<board>.anims.json` into `game/public/assets/sprites/` ([13 – contracts](13-PRODUCTION-PIPELINE.md#5--the-other-hand-over-contracts)). `--preview` adds a looping GIF per animation, at twice game size, to `art/sprites/previews/` for the review page; before approval, export with `--out tmp/atlas` so only the previews are kept.

## Smooth, not rubbery

The team's open question in A14: how do generated frames move without looking like rubber hose animation? The rubber look comes from in-betweens that morph one pose into the next. We avoid them like this:

1. **Poses, not in-betweens.** Each sheet is drawn as distinct key poses (contact, down, passing, up for a walk; anticipation, swing, follow-through, recoil for the chair) in **one** generation, so the proportions, palette and pixel size match. We never ask the model to interpolate between two frames.
2. **Stepped timing.** Play on twos at 12 fps, and hold the strong poses longer (anticipation, impact). Pixel art reads crisp when it snaps, not when it slides.
3. **Transitions at matching poses.** Idle→walk, walk→run and run start are short bridge clips that start and end on poses shared with the loops. The controller only switches on those frames (on a contact frame, the feet match).
4. **Smears instead of blends** for fast motion: one stretched smear frame on the chair swing and the knockback, as in Spider-Verse. No motion blur or warp.
5. **One grid, one palette.** Everything is crushed to the same pixel scale and 96-colour palette, and the feet are anchored to one baseline row, so frames don't wobble.
6. **Preview before approval.** Every sheet gets a looping preview at game size on its review page. A frame that pops is redrawn on its own against its neighbours as inputs.

## The crossing (no animation budget)

The region crossing uses only sprites the hero already needs (hit, knockback) plus one UI window the game renders with real text: **"THD.exe has stopped responding."** See the [crash frame](../art/direction/anomaly-language.md).

## Commands

```bash
python scripts/make_boards.py draw  [ids] [--redo] [--config …]   # generate (skips existing raws)
python scripts/make_boards.py crush [ids] [--config …]            # rebuild committed images offline
python scripts/make_boards.py pages [--config …]                  # Markdown page per image + index
python scripts/export_atlas.py <ids> [--preview]                  # approved board -> Phaser atlas + anims
python scripts/creek_layers.py [--build]                          # Rusty Creek layers: verify / rebuild
python scripts/stage_art.py prepare --config art/stages/rusty-creek/stage.json --out tmp/stage-art/next --band 512
python scripts/navigation.py && python scripts/check_docs.py
```

## What gets committed

- ✅ configs, briefs, crushed images and previews, stage plates, routes, collision data
- ❌ photos, audio, raw API output and rejected takes (`tmp/`), contact sheets, HTML viewers

<!-- nav:start -->
[← 08 – Tech stack and where things live](08-TECH-STACK.md) · [Design docs](README.md) · **9 / 14** · [10 – Jam plan →](10-JAM-PLAN.md)
<!-- nav:end -->
