# From reference collage to a place you can walk through

[← Campus proposal](../proposal/campus-game.md) · [Home](../../README.md) · [Next: technical contract →](../technical/layered-stage-contract.md)

![The hidden garden reference board](../../references/campus/images/hidden-gardens.png)

**The current deliverables are reference collages and planning.** This workflow defines later art production; no horizontal runtime stage, masks, animation sheet or playable build is claimed yet. Generated competition assets still depend on organizer rules.

```mermaid
flowchart LR
    A[Photos and voice ideas] --> B[Cleaned location collages]
    B --> C[Approve style and player scale]
    C --> D[Greybox route and camera]
    D --> E[Compose horizontal master]
    E --> F[Review and refine]
    F --> G[Separate layers and clean plates]
    G --> H[Mask limited motion]
    H --> I[Integrate and playtest]
    I --> F
```

## 1. Reference first, style second

Use the [seven location/item boards](../../references/campus/README.md) to choose actual shapes and materials. Start with the hidden garden. A photographic board is not a pixel-art style decision. Make one small style test at the intended player/camera scale before a long painting: terrain, one tree, water, a character silhouette and a small interaction prop. Use the [Planet of Lana developer demonstrations and layer analysis](../../references/games/planet-of-lana/layers-and-motion.md) for depth, soft contours and small motion; translate them into a consistent pixel treatment. The original uses hand-painted hybrid techniques, not pixel art. Classic Monkey Island supplies complementary curved pixel-contour examples. A pixel world need not use square terrain tiles.

**Proposed starting contract to approve:** a 640×360 design viewport, integer scaling where practical, one common pixel density, no rotation/filter that makes isolated assets look smoother than the world. A 24–32 pixel tall student is a test range, not an accepted sprite size. Readability at actual scale decides it.

## 2. Make horizontal composition support the route

Draw the entry, exit, ground profile, camera bounds, safe landings and lake anchors in a greybox first. Plan a three-screen strip (for example 1920×360 design pixels) rather than asking for an arbitrary huge banner. A generated reference/master may be higher resolution; reduce and inspect the entire scene consistently before runtime use.

Block the lake reveal as the main wide composition. Extend with overlapping crops of the **accepted** master: same horizon, light direction, scale, palette and landmark positions. Check the overlap and ground silhouette side by side; “same style” alone does not make adjacent images continuous. Reject duplicated trees, inconsistent path heights and new objects obstructing the exit. No endless-world generation is required.

## 3. Separate depth from collision

| Layer | Proposed content | Motion / rule |
| --- | --- | --- |
| Sky / clouds | Quiet negative space, slow cloud strip | Small drift, optional |
| Far landscape | Distant campus/tree shapes | Slow parallax |
| Far lake / bank | Water horizon, opposite reeds | Slow parallax; no collision |
| Mid vegetation | Willow canopy and reed groups | Modest parallax |
| Play plane | Ground, deliberate platforms, interaction props | Same world transform as collision |
| Front framing | Branches, reeds, ground lip | Slightly faster parallax; never hide essential landings |
| FX / UI | Shimmer, leaves, interaction cue | Local masks or screen layer |

These are proposed layers for our implementation, **not an extracted Wishfully layer stack**. The developer interview verifies a hybrid Unity workflow with some shallow modeled painted elements; our simple strip method is a separate jam-sized translation. Soft visual terrain can use hand-authored simple collision: broad slopes, clear cliff breaks and flat interaction/landing patches. Test a representative slope route before the master, so art does not lock in a controller problem. An alpha mask defines where pixels show; it does not tell the physics engine what is walkable.

## 4. Extract once, preserve the accepted scene

Each isolated object/layer needs genuine alpha, a fixed scene origin and a clean plate behind it. If a willow moves, remove the stationary willow copy below it and paint the newly exposed area once. Repeated generation must not drift the accepted terrain, platform edges or doorway geometry. Keep a flattened proof composite and compare it with the accepted master at every extraction.

Separate **alpha cutouts**, **FX region masks**, **interior reveal masks** and **collision geometry** in names and documentation. A black/white region mask is not itself a transparent sprite. Test premultiplied-alpha/fringing behavior over both light and dark backgrounds; do not ship a painted checkerboard as transparency.

## 5. Add just enough motion

First animation budget: one water shimmer region, one reed cluster and a sparse leaf emitter. Character budget: idle, walk, jump/fall, interact; hurt/attack only if their mechanic exists. Fixed frame canvas, feet/pivot and silhouette make the controller stable. Generated in-between frames need review for limb duplication, scale drift and changing costumes; image generation does not guarantee a coherent sprite sheet.

For the playground, an authored trigger can fade the exterior cutout to an aligned interior plate. Keep collision and player position stable. For reflection travel, reuse the interaction pose plus a short comic spin and an explicit safe destination. Avoid a cinematic transformation pipeline in the baseline.

## 6. Review on the moving camera

Scrub across every seam at actual zoom; check tree/ground continuity, distant strips exposing blank edges, collision feet, water readability, foreground occlusion and the mirrored state. Pause/blur and reduced-motion settings should stop decorative animation without breaking play. Keep a still art review and a gameplay review: a beautiful collage does not prove a good jump.

Voyager's inspected cabinet documentation demonstrates a useful discipline: approved masters, explicit masks, protected scene geometry and proof checks. Apply that discipline here. Its seasonal/time/weather matrix, palette, room assets and rendering constraints do not transfer to WinCS.

**Approval stops:** boards → one style test → one composed stage → layer proof → limited motion → playable review. Do not generate all biomes, character variants and weather sets before the first stage is understood.

[← Campus proposal](../proposal/campus-game.md) · [Home](../../README.md) · [Next: technical contract →](../technical/layered-stage-contract.md)
