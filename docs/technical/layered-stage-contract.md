# Layered stages · implementation proposal

[← Art workflow](../design/layered-stage-workflow.md) · [Home](../../README.md) · [Next: jam plan →](../delivery/jam-plan.md)

**Proposed, not implemented.** Continue with the [engine spike](technical-proposal.md); a layered image pipeline does not require Three.js or settle the engine. Phaser remains a candidate. Test broad slopes before committing to a controller. Keep the intended flowing contour; simplify incidental bumps or an optional verb before replacing the terrain language with a tile staircase.

## One stage manifest, explicit coordinate space

```json
{
  "id": "hidden-garden",
  "designViewport": [640, 360],
  "worldSize": [1920, 360],
  "layers": [
    {"id": "far-trees", "asset": "far-trees.png", "origin": [0, 0], "parallax": 0.25},
    {"id": "ground", "asset": "ground.png", "origin": [0, 0], "parallax": 1}
  ],
  "collisionFile": "collision.json",
  "reflectionPairs": [
    {"id": "lake-a", "from": "shore-a", "to": "shore-b"}
  ]
}
```

Illustrative file names and numbers, not assets that already exist. Lock design units, layer offsets, z-order, player-foot pivot and frame timings before export. Large strips should be split into bounded textures after testing target limits; overlap/edge padding must not produce duplicated seams. One scene can contain several camera regions without separate engines or repositories.

## Terrain and the controller

Author collision independently of painted alpha. Use a forgiving body inside the character silhouette, but keep the feet and actual safe ground aligned. Test uphill/downhill motion, slab edges, head clearance and the narrowest planned passage. A smaller body alone does not solve slopes. Wall grabs, moving ropes and arbitrary polygon physics are optional features with explicit costs.

## Curved terrain and pixel presentation

A pixel grid is a rendering choice, not a requirement for square tile collision. The [Lana layer study](../../references/games/planet-of-lana/layers-and-motion.md) distinguishes verified hybrid source techniques from our 2D strip proposal. Test broad up/down slopes, a crest, cliff, jump landing and flat lake anchor before selecting a physics/controller approach. Avoid tracing grass alpha into colliders. Use the same world transform for painted ground, character feet, interaction props and collision; decorative background planes never carry collision.

## Reflection transition contract

1. Activate only at a named anchor when grounded and in range; show one interaction cue.
2. Debounce input and enter a brief transition state. Lock further interactions, not the browser.
3. Resolve the paired anchor and target world state; validate safe spawn and camera bounds.
4. Swap the authored route/collision state atomically, place the player at its safe feet position, clear velocity and held-action state, then restore control.
5. Set a checkpoint on solid ground. Death resets actor, world state and camera together. Restart clears the whole session, including optional items.

Visual reflection and physical mirror world are different systems. Do not negate arbitrary coordinates and hope collisions still work. A first-slice version can use a short cut/fade, reused pose and a spin. Cooldown and anchor separation prevent an immediate teleport loop. Corruption is deliberate presentation; broken controls and missing assets are bugs to fix.

## Authored terrain-state change

![Normal/corrupted crossing contract](../proposal/diagrams/crossing-change.svg)

The crossing is a proposed state pair: `normal` has the lower path; `corrupted` removes it and enables an attainable upper rail route. This is separate from decorative parallax and separate from the lake teleport. Similar state pairs can later support campus ledges, puzzles or a bounded enemy arena without procedural map generation.

Illustrative expansion for a crossing stage, not an implemented manifest:

```json
{
  "id": "crossings",
  "initialState": "normal",
  "states": {
    "normal": {"composition": "normal.json", "collision": "normal-collision.json"},
    "corrupted": {"composition": "corrupted.json", "collision": "upper-route-collision.json"}
  },
  "change": {
    "trigger": "bridge-fault",
    "safeStagingAnchor": "before-bridge",
    "targetState": "corrupted",
    "stableExitAnchor": "beyond-rails"
  }
}
```

Before triggering, preview the alternate route and verify the required traversal verb exists. Preload both compositions and collision layouts. Commit from an authored safe region after a visible tell; do not silently delete supporting collision beneath the player. Swap rendered state, collision, interaction targets and any selected enemy/navigation state together at a controlled update boundary. Reject or defer a switch that would overlap the actor with new solids or strand it inside removed space.

A checkpoint stores stage, terrain-state ID, safe feet position, optional-item policy and any necessary encounter state. Death restores a coherent snapshot; full restart restores initial states everywhere. Prevent a held input from retriggering the fault. Never serialize only the screenshot/FX state while collision remains in another version.

**Required prototype checks if selected:** trigger twice, retry before/after the switch, approach from either side, restart, leave/re-enter the stage, lose focus during the tell, and verify the stable exit is still reachable. Check no invisible lower floor remains, no unmarked fall is introduced, and the rail art matches the upper collision. Stealth/combat variants need their own behavior/reset checks; masks alone do not implement those systems.

## Collectible and optional reveals

Robot baseline: uncollected → nearby cue → collected → small feedback. Choose whether death keeps it for the current session; restart always restores the starting state. A following companion requires its own reset and transition contract, so defer it by default.

Playground interior baseline if selected later: one exterior/interior pair with the same origin, one reveal region and one trigger. No changing collision during an opaque fade unless a safe placement is authored. Foreground masks never consume input or hide mandatory hazard tells.

## Verification before claiming a feature works

Fresh player: walk/jump/land along the full ground profile; no slope snagging or invisible steps. Cross each stage seam both directions. Trigger reflection repeatedly, die before/after it, restart twice, lose browser focus and return. Confirm no spawn overlap, velocity launch or stale world state. Optional item never blocks completion. Test the exported build, keyboard focus, mute/pause and one second device. Mobile remains a tested stretch goal, not “automatically supported.”

No runtime code, hosting change, issue board or project automation is introduced by this document.

[← Art workflow](../design/layered-stage-workflow.md) · [Home](../../README.md) · [Next: jam plan →](../delivery/jam-plan.md)
