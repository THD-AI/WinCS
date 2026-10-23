# Metroid Dread

<!-- nav:start -->
[← Visual reference views](../9-years-of-shadows/visual-reference.md) · [Game references](../../README.md) · **5 / 36** · [Visual reference views →](visual-reference.md)
<!-- nav:end -->

## At a glance · Learn a move, see a new route

[![Metroid Dread: gameplay reference](images/gallery-1.jpg)](visual-reference.md)

**Look for:** Separate the playable side view from cinematic shots; look for movement affordances.

[▶ Gameplay / trailer sources](#watch-and-source-trail) · [🖼️ More views and credits](visual-reference.md)

*Existing-game reference, not our concept art or a runtime asset. Image credit and original source: [visual reference](visual-reference.md).*

## Go deeper (optional)

Research date: 21 October 2026. Lex mentioned a tutorial-sized area as a scope analogy. It is not a request to reproduce Metroid.

## Verified reference facts

Nintendo describes a side-scrolling adventure on ZDR with E.M.M.I. pursuit, agile traversal and acquired powers that open previously inaccessible areas. [Official store page](https://www.nintendo.com/us/store/products/metroid-dread-switch/). The official ability guide covers sliding, ledge grabbing, melee counters and movement upgrades. [Nintendo gameplay guide](https://metroid.nintendo.com/dread/samus/).

## Design reading and dependencies

Our useful abstraction is `visible restriction → taught action → safe practice → combined challenge → revisit`. The tutorial's apparent size is an unreliable estimate of the engineering beneath it.

- Slide tunnels require consistent player dimensions, stance changes and collision rules. A gap that admits one pose and rejects another must remain readable at the intended render scale.
- Pursuit requires detection rules, navigation, reset behavior and a way to communicate danger. One patrol hazard with a visible detection cone is a smaller experiment than a hunter that crosses arbitrary rooms.
- Counters require synchronized enemy anticipation, input windows, invulnerability and outcome feedback. For a new team, a simple dodge or jump-over hazard is easier to validate.
- Returning with a power only feels satisfying if the player remembers the obstacle. Place the initial obstacle near a clear landmark and keep the return route short.

## Visual and production reading

The [official reference gallery](visual-reference.md) contrasts gameplay framing and a cinematic closeup. Observation: the source uses modeled, lit environments and characters for side-on action, not a hand-authored pixel sprite presentation. Do not budget cinematic shots for our jam.

The exact engine and proprietary asset pipeline were not established from the primary sources checked. Treat them as unknown. '2D game' describes the playable movement plane, not necessarily how its visuals are authored.

For our own prototype, keep physics entirely 2D even if background layers create depth. Optional WebGL lighting or 3D decoration should not change collision geometry. A 2D camera clamp and visible exit can communicate room structure without modeled cinematics.

## Bounded jam takeaway

Make one ability gate visible in room one, teach its ability in room two, apply it under mild pressure in room three, then return to the first gate. A complete loop is a better proof of the Metroidvania idea than a disconnected combat showcase.

Minimum evidence before art expansion: a new player understands the gate without explanation, cannot become trapped by its state and can restart after failure. One teammate should test a clean run without developer instructions.

## Watch and source trail

- [Official Nintendo gameplay page](https://metroid.nintendo.com/dread/samus/) contains ability demonstrations.
- [Official Nintendo store gallery](https://www.nintendo.com/us/store/products/metroid-dread-switch/) contains gameplay videos as well as stills.
- [Nintendo developer report on design iteration](https://metroid.nintendo.com/dread/news/metroid-dread-report-vol-10/) is useful background for discussing movement and level design together.

All retained Nintendo imagery is reference-only. No source meshes, textures or sprites were extracted.

<!-- nav:start -->
[← Visual reference views](../9-years-of-shadows/visual-reference.md) · [Game references](../../README.md) · **5 / 36** · [Visual reference views →](visual-reference.md)
<!-- nav:end -->
