# 9 Years of Shadows

<!-- nav:start -->
[← Visual reference views](../hollow-knight/visual-reference.md) · [Game references](../../README.md) · **3 / 36** · [Visual reference views →](visual-reference.md)
<!-- nav:end -->

## At a glance · Pixel spectacle

[9 Years of Shadows: gameplay reference](visual-reference.md)

**Look for:** Compare the richly decorated stage with the space the player actually needs to read.

[▶ Gameplay / trailer sources](#watch) · [🖼️ More views and credits](visual-reference.md)

*Existing-game reference, not our concept art or a runtime asset. Image credit and original source: [visual reference](visual-reference.md).*

## Go deeper (optional)

Research date: 21 October 2026. Mentioned by Lex as a pixel-art side-scrolling reference. Not an approved WinCS feature list.

## Verified reference facts

Halberd Studios describes pixel art, traditional animation and modern lighting in a world inside the automaton Talos. Europa uses elemental armor to change traversal and fighting possibilities. Restoring color and musical themes connect presentation to the fiction. [Developer overview](https://www.halberdstudios.com/9-years-of-shadows).

The publisher's store description identifies Apino as a companion with shielding and projectile abilities, and connects music to healing. [Steam page](https://store.steampowered.com/app/1402120/9_Years_of_Shadows/).

## Design reading and dependencies

Our interpretation: a world rule can carry story, progression and visual feedback together. For a jam, that is more useful than collecting unrelated mechanics.

- If an ability changes both traversal and combat, each use needs a safe teaching space and a later meaningful decision. Adding three such abilities requires substantially more than three independent code functions.
- Color can communicate restored state, route affordances and mood. The corresponding save state must drive both appearance and collision/interactions; otherwise the world communicates contradictory rules.
- A companion adds follow behavior, animation, targeting and visual clutter. A simpler experiment is one stationary helper or a single effect tied to the player's action.
- Dialogue introduces UI, input focus, line wrapping and interruption rules. A single short conversation can establish tone without a branching dialogue system.

## Visual and production reading

The inspected [reference views](visual-reference.md) show a dialogue overlay, a theater-like space and vertical traversal. Large ornate scenery and portrait art create a much larger asset burden than the phrase 'pixel platformer' suggests.

Confirmed: developer describes hand-crafted pixel scenery, traditional animation and dynamic lighting. Unverified in the sources checked: engine, authoring software, native sprite dimensions, tile size, animation export format and atlas organization. Engine remains unknown here; do not infer Unity merely from appearance.

For WinCS, a proposed small art package would use one shared palette, one reusable terrain set, one player sheet and one interaction effect. Keep portraits optional and avoid armor variants until one complete player animation set works in-engine. This is our production suggestion, not Halberd's workflow.

## Bounded jam takeaway

Possible experiment: an action restores one room's light, revealing a traversable route and one story detail. Use shape or animation as a second state cue so the rule does not depend on color discrimination. Three rooms, one state-changing action, one short dialogue and an ending are enough to test it. Do not combine elemental swapping, complex companion combat and several biomes in the first slice.

Ask Vatsal whether the appeal is richly colored pixel scenery, responsive melee, armor powers or the feeling of healing a broken place. These produce different prototypes.

## Watch

- [Halberd Studios official trailer](https://www.youtube.com/watch?v=XIm-ss9L3pA).
- [Nintendo launch trailer](https://www.youtube.com/watch?v=sYHBqQ0NeWo).

All retained images remain Halberd Studios' reference media; they are not a usable WinCS sprite library.

<!-- nav:start -->
[← Visual reference views](../hollow-knight/visual-reference.md) · [Game references](../../README.md) · **3 / 36** · [Visual reference views →](visual-reference.md)
<!-- nav:end -->
