# Coordinates preserve the composed strip and its objects

[← Layered workflow](../design/layered-stage-workflow.md) · [Visual sequence / limits](../../references/production/crossings-strip/README.md) · [Jam plan →](../delivery/jam-plan.md)

**Proposed, not implemented · 23 October.** One flat side elevation, one shared pixel treatment, multiple generated banners and inherited scene positions. The composition comes before object extraction. Phaser/browser delivery remains a candidate, not a new runtime introduced by this document.

**Executable follow-up:** [stage-art pipeline](stage-art-pipeline.md) now implements offline per-layer join preparation and protected RGBA replacement, with a dry-run API adapter. Its explicitly normalized canonical panels are **2160×720**, world 6480×720. The coordinate example below retains the older 2172×724 review units; use the current configuration's dimensions when running the tool. Game collision/rigging still remain unimplemented.

## Strip coordinates, not five appended chunks

Use a top-left origin, x right, y down. For the requested W=2172, H=724 review canvas:

| Source | Origin | Extent |
| --- | --- | --- |
| Left / center / right | `[0,0]`, `[2172,0]`, `[4344,0]` | Each W×H |
| Left–center join window | `[1086,0]` | W×H |
| Center–right join window | `[3258,0]` | W×H |

The world is **6516×724**. The viewport is separate and chosen after a character-scale test; a banner is not necessarily one screen. Join windows overlap existing world coordinates. Accepted seam repairs replace bounded source pixels; they do not extend world length.

[Current provenance](../../references/production/crossings-strip/media-sources.json) preserves actual PNG sizes, hashes, source graph and intended review origins. Native outputs differ slightly around W×H. The viewer maps them to a common display rectangle for comparison only. A production export needs a deliberate common native size, edge/pixel-density review and accepted seam repairs. Do not silently stretch individual layers to hide geometry drift.

## Five-plus roles, with explicit semantics

Illustrative production record; paths below are not implemented game files:

```json
{
  "id": "rusty-crossings",
  "projection": "flat-side-elevation",
  "worldSize": [6516, 724],
  "panelSize": [2172, 724],
  "panelOrigins": [[0, 0], [2172, 0], [4344, 0]],
  "joinOrigins": [[1086, 0], [3258, 0]],
  "depthRoles": [
    "far-scenery", "rear-structure", "ground-bank", "water",
    "traversal-interactables", "near-rails", "front-plants"
  ],
  "objects": "scene/reviewed-objects.json",
  "collision": "scene/reviewed-collision.json",
  "actors": "scene/reviewed-actors.json",
  "visualFx": [{"type": "row-stretch", "affectsCollision": false}]
}
```

Full-panel plates inherit their panel origin. A cropped object inherits `panelOrigin + sourceRect.topLeft`; its pivot is local to that crop. Extrapolation may add transparent padding or hidden geometry, so record a trim/padding offset too. This keeps the original placement without hand-rebuilding every tree or beam. Object IDs and reviewed anchors are necessary for interactive pieces, not for arranging a new prop kit.

| Role | Rendering | Gameplay data |
| --- | --- | --- |
| Distant trees/sky | Slow background depth | None |
| Rear bridge/piers | Behind the actor | Only selected blockers, if authored |
| Ground/bank | Play-plane position | Reviewed walkable contour |
| Water | Local reflection/ripple region | Hazard/interaction only if explicitly designed |
| Orange bars/ladders | Same camera transform as actor | Standable top / climb anchor / trigger per selected piece |
| Grey near rails | Occlude actor where appropriate | Decorative by default |
| Front plants | Sparse near occlusion; tiny pivoted motion | None unless an interaction is selected |

Do not move physical play surfaces at a different parallax factor from the character. Render-only depth motion cannot be allowed to separate a ladder from its climb anchor or the drawn floor from collision. Depth order can split by local overlap; seven roles do not demand exactly seven universal draw calls.

## Clean plates and individual grabs

Generate the complete scene first. Recover every needed bar/ladder endpoint and plant silhouette from that scene, extrapolating occluded parts. Preserve full-canvas alignment until a crop and its source offset/pivot are verified. Name standable bars, climbable ladders, decorative rails, movable bodies and animated plants separately.

Remove moving art from the static plate and fill revealed pixels. Recompose all still plates against the accepted dressed scene before parallax or animation. Check missing/duplicated material, edge halos, scale, registration and occlusion on light/dark. The earlier seven center trials failed registration. The [current replacement](../../references/production/campus-mutation/README.md) instead derives disjoint masks from the repaired scene: all seven roles cover three chunks and recompose exactly. Per-object reconstruction, rigs and collision remain future work.

## Controller and collision review

Trace a small authored route and check slopes, jump clearance, platform thickness, ladder entry/exit, headroom, spawn/exit and retry. Alpha is not a collider. Confirm connectivity across panel and seam boundaries. A picture resembling pathfinding does not require a pathfinding simulation or prove solvability. If an added movement verb cannot fit the budget, edit the scene or simplify the route.

## Visual faults versus physical events

Row cuts, repeated samples, stretched image bands and missing-image cues can remain render-only. Apply them inside a reviewed region, behind occluders when needed, preserving route/attack readability and collision.

The proposed entry → expansion/reveal → pushback → parkour beat is a separately authored physical event if chosen. Define warning, safe actor position, bounded displacement, control recovery and a reachable alternate route. Switch art/collision/interaction state together only when physics changes. Checkpoint/retry must restore the state. A screen smear does not imply any physics change.

Lake travel needs named anchors, input debounce, valid destination feet placement, velocity reset and recovery. Reflections alone implement none of this.

## Motion and verification

Each animated object/actor needs fixed canvas, source offset, pivot/feet, endpoint poses and timing. Review in-betweens for sliding, scale or limb drift. Rigged bodies need deliberate joints/constraints for the chosen mechanic.

Art acceptance: flat projection, location identity, common native canvas, fixed pixel treatment, accepted seams, clean alpha, still recomposition and camera-motion proof. Current trials satisfy only parts of that list.

Future gameplay acceptance: full route, selected climb/action, lake interaction, physical reveal if selected, safe retry, two restarts, focus recovery, win condition and clean export. No runtime, hosting change, issue board or workflow automation is introduced here.

The delivery fallback is a shorter coherent flattened strip plus separately authored collision and a small visual effect. It does not redefine the owner's desired multi-pass five-plus-layer art method.

[← Layered workflow](../design/layered-stage-workflow.md) · [Visual sequence](../../references/production/crossings-strip/README.md) · [Jam plan →](../delivery/jam-plan.md)
