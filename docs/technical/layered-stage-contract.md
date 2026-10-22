# Layered stages · implementation proposal

[← Art workflow](../design/layered-stage-workflow.md) · [Home](../../README.md) · [Next: jam plan →](../delivery/jam-plan.md)

**Proposed, not implemented.** Continue with the [engine spike](technical-proposal.md); a layered image pipeline does not require Three.js or settle the engine. Phaser remains a candidate. If the chosen collision system handles slopes poorly, simplify collision rather than changing the full renderer late in the jam.

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

## Collectible and optional reveals

Robot baseline: uncollected → nearby cue → collected → small feedback. Choose whether death keeps it for the current session; restart always restores the starting state. A following companion requires its own reset and transition contract, so defer it by default.

Playground interior baseline if selected later: one exterior/interior pair with the same origin, one reveal region and one trigger. No changing collision during an opaque fade unless a safe placement is authored. Foreground masks never consume input or hide mandatory hazard tells.

## Verification before claiming a feature works

Fresh player: walk/jump/land along the full ground profile; no slope snagging or invisible steps. Cross each stage seam both directions. Trigger reflection repeatedly, die before/after it, restart twice, lose browser focus and return. Confirm no spawn overlap, velocity launch or stale world state. Optional item never blocks completion. Test the exported build, keyboard focus, mute/pause and one second device. Mobile remains a tested stretch goal, not “automatically supported.”

No runtime code, hosting change, issue board or project automation is introduced by this document.

[← Art workflow](../design/layered-stage-workflow.md) · [Home](../../README.md) · [Next: jam plan →](../delivery/jam-plan.md)
