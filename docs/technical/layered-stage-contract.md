# Scene coordinates preserve the generated composition

[← Scene-first workflow](../design/layered-stage-workflow.md) · [Image trial / limits](../../references/production/master-first/README.md) · [Jam plan →](../delivery/jam-plan.md)

**Proposed, not implemented · 23 October 2026.** The complete horizontal image is the composition authority. Its derivatives inherit that canvas. This contract does not ask a developer to generate each tree, bar or ledge separately and hand-place a scene. Phaser/browser delivery remains a candidate; use the [technical spike](technical-proposal.md) to prove movement/export after theme and rules.

## Minimal stage record

```json
{
  "id": "rusty-crossings",
  "masterSize": [2172, 724],
  "sceneOrigin": [0, 0],
  "baseImage": "scene/master.png",
  "derivedLayers": [],
  "visualFx": [
    {
      "type": "row-stretch",
      "mask": "scene/background-fault-mask.png",
      "affectsCollision": false
    }
  ],
  "collision": "scene/collision.json",
  "actors": "scene/actors.json"
}
```

Illustrative runtime names, not existing game assets. 2172×724 is the measured trial canvas, not an approved game viewport or pixel density. The camera viewport is chosen after a player-scale test; it need not display the full world at once. No separate renderer/engine is needed per scene.

## One canvas; optional crops instead of object reconstruction

- Default full-scene image and any approved full-canvas plate share `[0,0]`, size and orientation. One common world-to-camera transform applies; do not reposition every drawn object.
- A cropped prop records its source rectangle and inherited scene offset. A tool can retain that metadata when grabbing it; only a changed placement needs a new authored position.
- A separate actor has a fixed canvas and feet/pivot. Actors, spawn points and interactions still need a few authored anchors; that is distinct from laying out the scenery object by object.
- A global image scale must be applied consistently to all derivatives and collision. Do not independently stretch a foreground plate to hide mismatched extraction.
- Empty `derivedLayers` is valid. Add background/foreground depth only after clean-plate and recomposition checks pass. Alpha bounds, visible fringes and shifted geometry need review, even when output dimensions match.

For parallax or local object motion, replace the static copy with a clean plate first. Drawing a moving cutout over the original copy produces duplicates. No automatic 3D scene reconstruction is required.

## Collision follows the accepted route

The AI can help identify/trace a small set of walkable contours, platforms and blockers from the composition. These remain authored gameplay data: review slope limits, jump clearance, platform thickness, headroom, spawn/exit and retry. Alpha pixels, rust textures and drawn ladders do not automatically become collision or a climb mechanic.

For the maze, mark one viable start-to-exit route, a few branches and dead ends. Use only the movement verbs selected by the team. If vertical progress needs a ladder/mantle mechanic beyond the controller, budget one or edit/simplify the image. A graph-like picture is not proof of a solvable platforming level. Do not build a pathfinding or procedural-maze system solely because the art uses a maze motif.

## Visual errors are the default

A visual effect changes rendering inside an inherited scene mask/clip. Examples: sample a narrow source row repeatedly, offset a strip, stretch a background patch or show a missing-image cue. Keep collision, interaction anchors, attack timing and input unchanged. A small known background opening is a sufficient first test; a full perfect foreground extraction is not a prerequisite for one clipped effect.

If the effect runs behind the play plane, use an approved foreground plate to occlude it. Otherwise choose a region that avoids critical route/attack cues. A whole-image visual cut needs readability review even though physics remains unchanged. Each effect's subject/motif can express a secret villain's influence without adding an actor or simulation.

The generated normal/smeared frames are appearance studies. Widespread pixel changes mean they are not an exact masked edit or a validated frame-swap pair. Prefer an effect applied to the accepted image/plate for stable runtime geometry. The extraction trial has real alpha but has not passed cleanup or recomposition; do not promote it silently to an approved layer.

## Lake transition and optional physical mutations

The lake touch/crash-spin still needs named source/destination anchors. Trigger in range from a valid pose, debounce input, move to a clear feet position, reset velocity/held action, then restore control and checkpoint. Rendering a reflection does not implement another physical world.

A disappearing floor, changing lane, spatial fold or normal/corrupted collision pair is an **optional separate mechanic**, retained from earlier exploration. If selected, preload both states, warn from safe ground, validate actor clearance/reachable exit and switch art/collision/interaction data together. Checkpoint/reset must store the physical state and safe spawn. Decorative image smearing never triggers this automatically.

## Character and effect iteration

Use approved endpoint poses, one frame canvas, fixed feet/pivot/facing and explicit durations. Review generated in-betweens in sequence. Attack anticipation/active/recovery, damage events and enemy recovery are authored logic, not inferred from art. Timebox cleanup; a smaller coherent action set is better than many drifting poses.

## Verification before claiming the workflow works

**Art:** same canvas/origin, clean alpha on light/dark, no static duplicate beneath moving art, recomposition against the accepted master, no seam or empty edge on camera movement. Generation/extraction trials are not passed tests by themselves.

**Gameplay:** full chosen route with walk/jump/selected climb, lake interaction, optional attack/enemy reset, death before/after transition, two restarts, focus loss/recovery, readable effect on/off, clear ending and clean browser export. A visual-only fault must leave collision unchanged. Mobile/hosting remain unverified until actually tested.

No runtime code, hosting change, project board or issue automation is introduced here. The practical fallback is one flattened master, minimal collision/actors and one small visual effect; additional masks/depth are optional polish.

[← Scene-first workflow](../design/layered-stage-workflow.md) · [Image trial / limits](../../references/production/master-first/README.md) · [Jam plan →](../delivery/jam-plan.md)
