# Hollow Knight

<!-- reference-navigation:start -->
[← Previous: Visual library](../../README.md) · [🖼️ Library](../../README.md) · **1 / 26** · [Next: Hollow Knight · gallery →](visual-reference.md)
<!-- reference-navigation:end -->

## At a glance · Vatsal’s starting point

[![Hollow Knight: gameplay reference](images/blue-cave.jpg)](visual-reference.md)

**Look for:** The tiny bright silhouette, readable ledges and feeling of a much larger place.

[▶ Gameplay / trailer sources](#watch-and-source-trail) · [🖼️ More views and credits](visual-reference.md)

*Existing-game reference, not our concept art or a runtime asset. Image credit and original source: [visual reference](visual-reference.md).*

## Go deeper (optional)

Research date: 21 October 2026. Priority: Vatsal's main reference. This describes a reference, not an approved WinCS design.

## Verified reference facts

Team Cherry presents a 2D action adventure set beneath Dirtmouth in an interconnected ruined insect kingdom. Exploration, combat, traps and acquired abilities are central. Its artwork and animation are hand drawn; the original game is **not pixel art**. [Official game site](https://www.hollowknight.com/). Unity confirms the engine. [Unity developer feature](https://unity.com/made-with-unity/hollow-knight).

## Design reading and dependencies

The useful model for our planning is `read a space → attempt a route → encounter a limitation → acquire or learn something → revisit the space`. This is our design interpretation, not a specification extracted from the original project.

- Movement comes first: jump distance, air control and collision determine feasible ledges and gaps. A new movement ability changes the map's reachable set, so its implementation and level layout must be designed together.
- Combat requires readable attack anticipation, hit detection, hurt feedback and recovery. Each extra attack direction multiplies animation, collision and testing work.
- An interconnected map requires return routes, persistent unlock state and respawn rules. A loop with one shortcut can demonstrate the idea without a large world.
- Mystery can come from repeated environmental motifs, an unreachable landmark and one changed room. A deep fictional history is optional; clarity of the next action is essential.

## Visual and production reading

See [visual-reference.md](visual-reference.md) for three inspected official screenshots. Side-on play and strong character contrast are transferable. Layered scenery, foreground silhouettes and a restricted area palette make depth without requiring 3D gameplay. These observations do not establish the source project's layer hierarchy or shader settings.

Confirmed production facts: traditional 2D hand animation and Unity. Unverified here: exact art application/version, atlas packing, animation frame counts, collision shapes, camera script and source folder structure. Do not present a reconstructed pipeline as Team Cherry's pipeline.

For our own prototype, a possible organization is `player/{idle,run,jump,fall,hurt}`, `enemy/patrol`, `tiles/ruin`, `effects/hit`, plus explicit frame durations and fixed pivots. This is a proposed small-team convention, not reverse engineering.

## A bounded experiment for Vatsal

Build three to five tiny connected rooms, one movement upgrade, one enemy behavior and one return shortcut. Test a complete three-minute path using rectangles before commissioning animation. Pick either simple combat or a puzzle interaction as the main source of difficulty. Only add a boss if the full route already works.

Ask Vatsal to rank: movement feel, lonely exploration, melee combat, mystery and atmosphere. A love of Hollow Knight does not imply wanting every system it contains. The pixel-art treatment is a separate preference to validate with Lex.

## Watch and source trail

- [Team Cherry release trailer](https://www.youtube.com/watch?v=UAO2urG23S4): review movement framing, room transitions, combat readability and pacing; do not infer exact timings from a cut trailer.
- [Official screenshots and press-kit entry](https://www.hollowknight.com/): retained media are reference-only, credited to Team Cherry.

No source sprites or game code were extracted. Engine choice for WinCS remains independent of this reference.

<!-- reference-navigation:start -->
[← Previous: Visual library](../../README.md) · [🖼️ Library](../../README.md) · **1 / 26** · [Next: Hollow Knight · gallery →](visual-reference.md)
<!-- reference-navigation:end -->
