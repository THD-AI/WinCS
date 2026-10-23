# Repeatable stage art · extend, repair, extract, verify

**Current application:** [integrated creek mutation](../../references/production/campus-mutation/README.md), [configuration](../../references/production/campus-mutation/stage.json), [packet/source snapshot](../../references/production/campus-mutation/media-sources.json) and [report](../../references/production/campus-mutation/verification.json). The same tool repairs both joins in the combined full-scene painting. Seven center depth trials illustrate extraction only; they are not falsely configured as complete three-chunk layers. Each must gain aligned left/right plates before it can use the identical per-layer seam process. The viewer's brief row-cut/stretch reveal changes presentation, not collision. Fix registration and alpha before treating those plates as production masks.

[← Visual workflow](../design/layered-stage-workflow.md) · [Earlier separate maze / seam study](../../references/production/seam-pipeline/README.md) · [Coordinate contract](layered-stage-contract.md)

![Substantial branching maze restored from the preferred reference](../../references/production/seam-pipeline/images/maze-center.png)

**23 October 2026 · implemented offline pipeline, live API adapter dry-run verified.** Image generation makes and repairs art; code prepares exact canvases/masks, copies only the intended pixels and records provenance. It does not automatically approve visual seams, route connectivity, extracted sprites or a game.

## The complete production sequence

1. **Lock the direction:** location collage + flat side-elevation camera + pixel treatment + scale + protected landmarks. For Rusty Crossings, keep the preferred substantial blue-green riveted girder maze, broad platforms, tall concrete shafts, branches/loops and ladders. The thin orange-bar pass is superseded as the traversal direction.
2. **Compose a clean location:** no corruption, actors or gameplay dressing. Build center, then same-size left/right extensions. World length is three panels, not three camera screens.
3. **Repair real joins:** form a panel-width context from the right half of the left neighbor and left half of the right neighbor. Generate a repair of the narrow central band. Copy back only that band, including alpha; preserve all other pixels exactly. Repeat for every depth layer, not a semitransparent overlay over a different layer.
4. **Dress the accepted layout:** compose the full traversal network in place. The preferred maze is a design authority alongside the real location references; a giant straight bridge must not squeeze all traversal into a shallow band.
5. **Derive five-plus roles:** far scenery, rear architecture, bank, water, traversal/interactables, near rails and plants. Preserve source positions; fill occluded geometry and clean plates before moving anything. Run the same join method on each role. Use a distinct layer configuration/repair direction for each.
6. **Grab/rig selected objects:** retain chunk ID, local source rectangle, padding offset, feet/pivot, semantic role and explicit movement/collision anchors. Clean the static duplicate, then test limited motion/in-betweens. No per-object pack or rig is automatically implemented by extraction.
7. **Verify/review:** recompose still layers; inspect transparent edges, every repair boundary, camera motion, route and reflection coverage. Code protection is one gate; artistic continuity and playable geometry are separate gates. Add corruption and the selected reveal/physical event only after the clean composition works.

The current example proves step 3 on **two distinct layer studies**, not a completed seven-layer game scene. The clean location source includes a straight bridge and remains a separate study; it is not composited behind the full-height maze as an approved final background.

## A shared expandable strip

[stage.json](../../references/production/seam-pipeline/stage.json) defines `panel_size`, ordered stable `chunks`, and each layer's file for **every chunk**. Canonical panel size is **2160×720**; three chunks span **6480×720**. This is separate from the earlier 2172×724 review rectangle. Existing generated inputs are explicitly normalized with nearest-neighbor sampling, with native dimensions recorded. No silent browser-only resize is called a production export.

- Extend left/right by supplying the new chunk's art in each layer and inserting its ID at the beginning/end of the order.
- Insert in the middle by supplying every layer for that chunk and inserting one shared ID. Existing source files stay unchanged; origins are recomputed from order. Never insert a chunk in only the water or only the traversal layer.
- Rerun preparation. Each adjacent pair receives a panel-width staggered window. In this demo a **512-pixel central band** is editable; all surrounding pixels are protected.
- Invalidate/review the new neighboring boundaries, collision links, local anchors and any reflection capture. This first implementation regenerates all join packets for the version; it does not yet cache only the changed neighbors.

Prefer chunk-local anchors over naked world x coordinates. `worldX = chunkIndex × panelWidth + localX` keeps objects attached when an earlier chunk is inserted. A route still needs reviewed ports at each edge; an image repair does not automatically make two platforms reachable.

## Run the offline workflow

Install the local canvas dependency once:

```powershell
python -m pip install -r requirements-art.txt
```

Prepare a fresh version; no network or API key is needed:

```powershell
python scripts/stage_art.py prepare --config references/production/seam-pipeline/stage.json --out tmp/stage-art/my-review --band 512
```

Each job folder contains `context.png`, **RGBA `edit-mask.png`**, `copy-mask.png`, `prompt.txt` and `request.json`. The API edit mask is transparent in the editable band and opaque outside. The separate copy mask is white where the compositor will replace pixels. The packet hashes the worlds, inputs, contexts, masks, prompts and requests.

For built-in imagegen: inspect the context, supply it as the edit target, use the prompt and mask as constraints, save the complete result as `candidates/<job-id>.png`. Built-in generation has no explicit mask parameter here; the deterministic splice is what enforces the outside-pixel invariant.

After all candidates for the chosen packet exist:

```powershell
python scripts/stage_art.py apply --packet tmp/stage-art/my-review --candidates tmp/stage-art/my-review/candidates --out tmp/stage-art/my-review/applied --normalize
```

`--normalize` explicitly permits at most 2% dimension drift and uses nearest-neighbor sampling. Without it, mismatched sizes fail. The tool requires the complete selected packet, rejects stale/tampered packets and existing output versions, replaces alpha instead of merely blending over it, and proves zero changed pixels outside all copied bands. Its report **never marks visual seams approved**. Do not use a broad feather/crossfade to hide a broken ladder or girder endpoint.

Scratch packets, composed strips and replay outputs remain in ignored `tmp/`. Selected original generation results and prompts are committed as review assets; reproducible derived strips are rendered by the viewer rather than committed again.

## GPT Image 2.5 API route

The verified precise-editing model is **`gpt-image-2.5-sunburst`**. Its API supports custom dimensions, transparent PNG output and image edits with an alpha edit mask. The 2160×720 canvas meets the documented dimension constraints. The mask applies to the first input image; the model may still drift, so the compositor copies only the intended band. [Model](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) · [Output constraints and transparency](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options) · [Edit API](https://developers.openai.com/api/reference/python/resources/images/methods/edit). Verified 23 October.

The repository adapter invokes the installed imagegen skill CLI without modifying it. Pass its actual installation path:

```powershell
python scripts/stage_art.py submit --packet tmp/stage-art/my-review --job maze--left--center --cli C:/Users/rudae/.codex/skills/.system/imagegen/scripts/image_gen.py
```

Default is **dry run**. To make that one API submission, set `OPENAI_API_KEY` locally and add `--execute`; the installed CLI environment also needs its API dependency. No credentials are stored in packets, repository files or CI. Existing candidate output is never overwritten or resubmitted implicitly.

**Installed-client limitation:** this CLI accepts the requested 2.5 model but validates explicit custom sizes using its older size list. The adapter therefore sends `size=auto`, keeps desired dimensions in the packet/prompt and rejects incompatible output sizes during application. It does not substitute another model or edit the installed CLI. A future updated client can submit the exact packet size directly. Live account access, billing and paid endpoint behavior have not been tested; this turn's images used built-in generation, whose model ID was not exposed.

## Water and reflections

Keep the water silhouette/mask and waterline in the same chunk-local coordinate system. Reflections should capture approved visible layers/actors at the same camera position, mirror them around that waterline and clip them to water, with bounded distortion/tint. They must not permanently bake today's maze into a water sprite: insertion or a moving actor would make it stale.

The viewer includes an optional **schematic reflection preview** of the maze, not a physically accurate water shader, a mirror-world mechanic or final art. Water capture extents and seam repairs need rechecking after extension/insertion. Reflected pixels never create collision. Separate depth roles may need separate reflection transforms.

## Validation and change review

```powershell
python -m unittest discover -s scripts -p test_stage_art.py -v
python scripts/check_docs.py
git diff --check
```

Ten offline tests cover protected RGBA pixels, deleting old alpha, correct join windows/edit-mask convention, missing layers/candidates, explicit size normalization, immutable versions, stale inputs, middle insertion and dry-run/model preservation. The art CI runs these without API credentials. The actual two-layer demo also reports zero outside-band pixel changes. Visual edge residue and some repair-boundary mismatch remain; no seamless or playable-art acceptance is claimed.

Issue [#14](https://github.com/THD-AI/WinCS/issues/14) tracks this explicitly requested pipeline. One child PR targets #13's branch so it can be reviewed or rejected separately. After #13 merges, retarget the child to `main` and recheck its diff; do not merge or restack automatically. The project board and general issue/board automation remain deferred.
