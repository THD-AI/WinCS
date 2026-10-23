# 02 – Game design

<!-- nav:start -->
[← 01 – Proposal](01-PROPOSAL.md) · [Design docs](README.md) · **2 / 13** · [03 – Story and cast →](03-STORY-AND-CAST.md)
<!-- nav:end -->

![What playing looks like – HUD and the pocket computer's map](../art/direction/images/hud-preview.png)

| Explore | Fight | Rest | Cross |
| --- | --- | --- | --- |
| [![Lost in the Green](../art/direction/images/lost-in-the-green-preview.png)](../art/direction/lost-in-the-green.md) | [![Combat](../art/direction/images/combat-preview.png)](../art/direction/combat.md) | [![Mensa](../art/direction/images/mensa-interior-preview.png)](../art/direction/mensa-interior.md) | [![Anomaly crossing](../art/direction/images/anomaly-language-preview.png)](../art/direction/anomaly-language.md) |
| Hills, branches up and down, secrets behind grass | The chair against autonomous robots | Coffee machine save point; Dexter trades | Touch the anomaly, crash, land somewhere else |

## Core loop

**Explore a broken region → fight the anomalies living in machines → find the region's object or upgrade → reach the region's anomaly → cross into the next dimension.** Between fights you rest at coffee machines, where Dexter trades with you and takes the anomaly energy you collected.

The loop in one minute: walk right, something is wrong in the scenery, a rover spots you, you swing the chair, it stops dead and leaks black fluid that Dexter later absorbs, you climb a ladder to a branch you couldn't reach before, you find a muffin, you save at the coffee machine.

## Controls – four directions, two buttons

Left, right, up, down and two buttons. That works on keyboard, gamepad and a touch overlay alike. This was the explicit request in the 23 Oct meeting.

| Input | Keyboard | Gamepad | Action |
| --- | --- | --- | --- |
| ← → | A / D, arrows | Stick, D-pad | Walk; run after 0.4 s held |
| ↑ | W, ↑ | Up | Interact (sign, coffee machine, Dexter, pickup); climb ladder |
| ↓ | S, ↓ | Down | Drop through one-way platform; climb down |
| **Jump** | Space / K | A / Cross | Jump. Hold for higher (variable height) |
| **Act** | J | X / Square | Tap: attack with the current weapon. Hold: guard (chair) |
| ↑ + Act | | | Up attack |
| ↓ + Act in air | | | Down slam / pogo (bounce off an enemy or hazard) |
| Menu | Esc / Tab | Start | Pocket computer: map, archive, items (after you get it) |

The weapon is switched in the pocket computer menu (or ←/→ while the menu is open). The menu key is a system button, like Start, and does not count against "two buttons".

## Movement

- **Walk / run:** one speed curve, about 3.5 m/s walking and 6 m/s running, with a short acceleration so the poncho has weight.
- **Jump:** variable height, from about 1.2 m (tap) to 2.2 m (hold). Coyote time is 0.1 s and jump buffering 0.12 s. These two are the cheapest things that make a platformer feel good.
- **Hills:** the ground is a smooth polyline. You walk up and down slopes up to 40°, like Planet of Lana and Ori. There are no staircase blocks.
- **Slides:** slopes steeper than 40° are slides. You skid down them fast with the poncho flapping, and can jump off at any point.
- **Ledge grab:** jump at a marked ledge edge and the hero catches it, hangs, and pulls up with ↑ (or drops with ↓). Ledges are authored in the collision data, never guessed from pixels.
- **One-way platforms:** girder decks, scaffold planks, tray stacks. ↓ + Jump drops through.
- **Climbing:** ladders, vines, scaffold and stairs. Press ↑ in a climb zone. Climbing is slow, and you can't attack while climbing.
- **Glide (later, Lex's proposal):** hold Jump in the air and the poncho opens like a sail for a slow, steerable fall. It's the Region 2 upgrade that opens Lost in the Green's upper routes. It's in the design and the collision data from day one, but not in the jam slice.
- **Four directions:** every region is explored left/right *and* up/down: a mountainside route, a lower branch, an underground pocket ([04](04-WORLD-AND-LEVELS.md)).
- **No wall-jump, no dash in the jam slice.**

## Health, damage, death

- **Health:** 5 battery cells (HUD top-left, Hollow Knight-sized). Enemy contact or a hit costs 1 cell; Jenny's charge costs 2.
- **On hit:** white flash, knockback (about 1.5 m), 1 s of invulnerability with flicker.
- **Death:** the hero collapses into pixel dust. You respawn at the last coffee machine with full health. Defeated normal enemies return; bosses stay defeated.
- **Healing:** food pickups (muffin 1 cell, cake slice 1, Leberkäse roll 2, wafer 1). Drinking coffee at a save point refills everything.
- **Pits and hazards** (creek current, toxic sap): lose 1 cell and reappear at the last safe ground. No full death.

## Combat

Every weapon is a real object we photographed and posed with on 23 Oct.

| Weapon | Found | Verbs | Feel |
| --- | --- | --- | --- |
| **Chair** (plywood + black steel legs) | Rusty Creek, first room | Side sweep, up attack, down slam / air pogo, **guard** (hold Act: legs pointed forward like a shield) | Weak, slow-ish, honest. Big hit-stop (60 ms) |
| **Tray** (yellow Mensa tray) | Lost in the Green (region 2) | Throw: flies like a boomerang and returns; catch it to throw again | Ranged; lets you kite drones |
| **Sign pole** (yellow town-sign on a steel pole) | Campus (region 3) | Heavy forward thrust, long reach; breaks guards | Slow, strong |

- Every hit gets hit-stop, a pixel impact burst, a short knockback and a sound.
- Enemies show a 0.4–0.6 s **tell** (flash, rear-up, lidar turns red) before attacking.
- **Guard:** blocks frontal damage and pushes you back a little. A heavy hit (Jenny) breaks the guard.

## The glitch meter (after Region 1)

Each defeated anomaly charges a 3-segment **glitch meter**. This was Lex's idea, merged with Alexander's Dexter version:

- **1 charge – Ctrl+Z:** rewind yourself 1 second (dodge through an attack, or undo a bad jump).
- **3 charges – 404:** every enemy on screen glitches out for 3 s (stunned, and takes double damage).
- **At a coffee machine, Dexter takes whatever is left in the meter** and, once enough has piled up, gives you the region's upgrade. This is the hook for the story: you are feeding him.

The jam slice ships without the meter if time runs out (cut item 2 in the [jam plan](10-JAM-PLAN.md)).

## Items and progression

| Item | Where | What it unlocks |
| --- | --- | --- |
| **Pocket computer** (the aluminium experiment suitcase, shrunk to a handheld) | Dexter gives it in Rusty Creek after the crash | Map (rooms fill in as you explore; no minimap), archive (notes, enemy entries), items, weapon switch |
| Region upgrade | Dexter, at the end of each region | One new movement or combat ability per region: glide (R2), tray recall (R3), wall-slide (R4) – post-jam |
| Notes / archive entries | Hidden in secret spots | Lore about the experiment and about Dexter. They are what makes "secret paths" worth finding |
| Food | Lying around, from Dexter | Healing |

**Backtracking:** a new ability makes an earlier visible ledge reachable. There is no free teleporting. Fast travel comes only through anomalies you have already crossed (see [world](04-WORLD-AND-LEVELS.md)).

## Every region has two states – clean and anomaly

You enter every region in its **clean** state: the real campus place, calm and pretty. Somewhere in it is that region's **anomaly**, which is always a different thing and always pointed out the first time (Dexter points at the pond). When you touch it, the region **turns**. The same place becomes its anomaly version, you're pushed back to the region's start, and the stage you now explore is the broken one. Rusty Creek is the model: first the normal creek and bridge, then the rust maze that looks like a pathfinding algorithm.

| Region | Clean | Its anomaly (what you touch) | Anomaly state |
| --- | --- | --- | --- |
| Hidden Garden | Pond, deck, reeds | The patch of the pond that reflects girders | The reflection climbs out; girders grow through the reeds |
| Rusty Creek | Creek, rails, bridge | The bridge's railing shimmers | The rust maze |
| Lost in the Green | Pampas hills, slab path | A granite boulder with one mirror face | Hedge maze, birches repeated, leaves fall upward |
| Campus | Plaza, scaffolded Mensa facade | A black puddle that reflects nothing | Scaffolding grows into the sky; facade cut and repeated |
| Mensa | Night cafeteria | The coffee machine screen shows a pond | Chairs stack into towers; trays float as steps |
| Toxic Garden | Corten beds under the highway bridge | One flower turned the wrong way | Plants huge and leaning; every flower watches you |
| Playground | Towers, net bridge, slide | The slide's opening is too dark | Towers stretch; the slide coils across the stage |

Concepts for every pair: [stage concepts](../art/locations/README.md).

**Crossing is cheap: sprites plus one window.** Touch → the regular damage sprite → freeze → an old Windows-style error window, **"THD.exe has stopped responding."** [OK] → cut → you land in the new state, and the damage sprite finishes. No cinematic, no special animation: the hit and knockback sprites the hero needs anyway, plus one UI window rendered by the game (real text, not art). The same sequence carries you into the next region at its exit anomaly.

## What is NOT in the game (on purpose)

Gore, blood, an apocalypse, a minimap, crafting, an economy, procedural runs, dialogue trees. Dexter speaks in short lines, three at most per visit.

<!-- nav:start -->
[← 01 – Proposal](01-PROPOSAL.md) · [Design docs](README.md) · **2 / 13** · [03 – Story and cast →](03-STORY-AND-CAST.md)
<!-- nav:end -->
