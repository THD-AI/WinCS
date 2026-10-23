# Whole image first · then only the layers we need

[← Visual proposal](../proposal/campus-game.md) · [Trial images and QA](../../references/production/master-first/README.md) · [Technical contract →](../technical/layered-stage-contract.md)

![A complete composed rust-maze scene, before extraction](../../references/production/master-first/images/rust-maze-master.png)

**Current production approach, 23 October 2026:** Codex and built-in image generation compose an entire horizontal scene first, refine that same image, then derive aligned layers/props from it. We are not starting from a bag of independent trees, bars, ledges and rocks to arrange manually. Today’s images are visual-direction/pipeline trials; runtime production remains subject to team/theme/rules.

## 1. Establish one scene, one scale and one visual language

Supply the relevant location board, desired play emphasis and a short layout brief: entry/exit, broad route, open spaces, materials, light, character scale and protected silhouettes. The output is a whole-scene candidate, not automatically playable geometry. Review it at camera/player scale; choose one common pixel treatment before asking for more stages.

The [Rusty Crossings trial](../../references/production/master-first/README.md) shows rusted orthogonal branches/shafts as a maze. Hidden Garden, Lost in the Green, creek and Toxic Garden retain organic contours and may support exploration/action or an alternative hiding puzzle. Location photographs supply motifs; they do not dictate every game surface.

A quick greybox/collision trace tests the *chosen composition* and proposed route. Image and controller iterate together: fix an unreachable platform with a same-image edit or simplify the planned route. Do not spend the jam building a separate scene editor or reproducing every pictured object in physics.

## 2. Keep editing the accepted canvas

Ask for a precise change to the current master: add a ledge, open a passage, refine a stone/plant cluster, improve an entry or simplify an overcomplicated section. State what must stay fixed. Keep the previous accepted image and compare the whole output, not just the requested addition. A regenerated image may change pixels or geometry elsewhere.

The generation/extraction request packet includes: accepted image + source recording/clarification, canvas/camera, change region, protected route, shared pixel language and the review needed. No lengthy new layout coordinates are needed for every object; it is already drawn in place.

## 3. Derive a minimal set from that scene

| Derivative | How it relates to the master | Why it exists |
| --- | --- | --- |
| Flattened accepted scene | Original complete image | Baseline stage visual; always available as fallback |
| Background clean plate, if needed | Remove foreground from the same canvas; fill exposed pixels | Allows background effects or limited depth without duplicate scenery |
| Foreground/play-plane plate, if needed | Extract existing structure on alpha, preserve canvas/placement | Covers the background effect and keeps the route readable |
| FX region mask | Full-canvas white/black region or equivalent clip; black/transparent means unaffected | Restricts a smear, shimmer or reveal without moving collision |
| In-place prop crop | Grab the existing prop; record its crop offset automatically | Local motion, pickup or a repeated action without hand-rebuilding its placement |
| Character/action canvas | One separately approved actor design with fixed feet/pivot | Controllable actors need coherent poses and timing |

**Full-canvas layers inherit the same origin `[0,0]`.** A crop retains where it came from; tools can record that rectangle/offset. The coordinate contract preserves existing composition rather than forcing manual placement of a fresh prop kit. These are possible derivatives, not a requirement to extract seven depth planes.

When an object moves, remove its static copy and supply a clean plate behind it. A foreground layer over an unchanged flattened master does not create true parallax: the stationary duplicate would still be visible. If a valid clean plate cannot be obtained quickly, keep that part static.

## 4. Prove extraction before trusting it

![Same-canvas foreground extraction trial, not approved](../../references/production/master-first/images/rust-maze-foreground-trial.png)

The actual trial has genuine RGBA transparency and the same 2172×724 canvas, but visible edge residue and incomplete cleanup remain. No background clean plate/recomposition has passed. Equal dimensions alone do not prove alignment or a clean reusable sprite.

Review alpha edges over light/dark backgrounds, source positions/scale, missing geometry, unintended semi-transparent residue and color drift. Recompose the extracted plate with its clean background and compare against the accepted master. Inspect the moving camera only after that still proof passes. A failed layer stays a trial, not an approved asset.

**Jam limit:** one extraction/clean-plate cycle plus one bounded correction, then decide. If it remains poor, use the flattened master with a small clipped effect and no parallax in that region. Do not spend the remaining jam repairing a full scene graph.

## 5. Make visual corruption cheap

![Background slice/stretch effect direction](../../references/production/master-first/images/rust-maze-background-smear.png)

Default effects change image presentation: stretch/repeat a narrow row, offset a background strip, reveal a missing-image patch or animate a small corruption mask. A renderer can sample the accepted image differently inside that mask. The collision contour and input stay the same. The generated smeared image is an appearance reference; widespread pixel changes make it unsuitable as an exact runtime swap.

If a foreground plate is not clean, choose a small background opening/region that avoids important route silhouettes. Whole-scene cuts are another visual option only if the player can still read the real route and attack cues. A 404 motif does not require an elaborate encroaching creature, spreading geometry or a new world-state system.

A terrain-changing event is separately scoped: explicit before/after collision, safe actor placement and reset. The earlier diagram ideas remain optional, not the baseline for every error.

## 6. Characters, attacks and in-betweens use the same review discipline

Make one student and the selected action states, not a cast. Approve endpoint poses, fixed frame size, feet/pivot, facing and held prop. Ask for a few in-betweens within that canvas; review the complete loop/transition for sliding, limb duplication, scale and costume drift. Attack hit timing, hurt state and recovery are gameplay decisions, not inferred from generated pictures.

A placed campus object can seed a prop sprite; a rigged actor still needs a coherent action canvas. Keep movement and the chosen signature action first. Add one weapon/enemy only if the team chooses combat, then verify anticipation/active/recovery and reset. Optional robot collection can use a short beep/flash rather than companion AI.

## 7. Extend only the accepted result

An extension starts from the accepted scene edge or overlap: same contour language, horizon, scale, materials and light. Generate a bounded continuation, compare seams and route continuity, then derive only its necessary masks. Adjacent images are not continuous merely because their prompt names the same style. No seasonal/time/weather matrix or procedural map generator is requested.

**Review order:** full composition → route/scale check → same-image edits → minimal derivative proof → one visual effect → playable integration → next bounded scene/action. [Art and audio brief](art-and-audio.md) · [Jam gates](../delivery/jam-plan.md).

[← Visual proposal](../proposal/campus-game.md) · [Trial images and QA](../../references/production/master-first/README.md) · [Technical contract →](../technical/layered-stage-contract.md)
