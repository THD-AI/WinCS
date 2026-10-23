# 05 – Enemies and bosses

<!-- nav:start -->
[← 04 – World and levels](04-WORLD-AND-LEVELS.md) · [Design docs](README.md) · **5 / 13** · [06 – Visual direction →](06-VISUAL-DIRECTION.md)
<!-- nav:end -->

![Boss – Jenny, the runaway race car](../art/direction/images/boss-jenny-preview.png)

Every enemy is a real machine we photographed in THD's display cases and on campus, now possessed by an anomaly. When one is defeated it collapses into black goo, and Dexter absorbs the goo later.

## Regular enemies

| Enemy | Source | Size | HP (chair hits) | Behaviour | Tell | Counter |
| --- | --- | --- | --- | --- | --- | --- |
| **Rover** | 4-wheel lidar lab rover, yellow wheels | Knee-high (≈ 25 px) | 3 | Patrols a deck. Spots you with its lidar, then charges in a straight line | Lidar turns red, rears up for 0.5 s | Jump over the charge and hit it from behind; guard works |
| **Walker** | Six-legged hexapod robot | Waist-high, wide (≈ 40 px) | 4 | Creeps toward you; rears up and stabs with its front legs; can walk under decks | Front legs raised for 0.6 s | Step back, then punish; up-attack when it's on a deck above |
| **Drone** | Large black quadcopter | 1 m span (≈ 45 px), flies at head height | 8 (chair) / 3 (tray) | Hovers out of reach and drops screws or sparking batteries; dives when you're under it | Red eye flashes and it tilts | **Avoid it** in Region 1 (hide under girders). Kill it later with the tray. Coming back for drones is intended backtracking |
| *Later:* Mutant plant | Toxic Garden | – | – | Stationary, spits sap | Mouth swells | Down-slam its head |

All of them: contact damage 1 cell, white hit flash, 3–4 frame knockback, and a goo burst when they die.

## Boss – Jenny, the runaway race car (Region 1)

Jenny is the green-and-black Formula Student car from the THD team banner (the cars on it are called Jenny 1C, 2C, …). Here she drives herself, with headlight eyes and goo leaking from her bodywork. 30 chair hits, in three phases. The pattern comes straight from the brief: she tries to run you over, crashes into things, sheds parts you have to dodge, slows down, you hit her, she charges up again, and it repeats.

| Phase | HP | Pattern |
| --- | --- | --- |
| 1 | 30→20 | **Rev** (1 s, engine shakes, exhaust) → **charge** across the arena → **crash** into the far wall → 3 parts fly out in arcs (spring, bolt, wing shard) → **stunned** 3 s (hazard light blinking): hit her → reboot with green sparks → repeat |
| 2 | 20→10 | Same, but she **charges twice** (turns at the wall) and drops a loose **wheel** that rolls along the floor |
| 3 | 10→0 | She jumps: the charge launches off a ramp in an arc. Jump under it or guard. 5 parts per crash. Stun lasts only 2 s |

- **Charge** does 2 cells. **Parts** do 1. Guarding a charge breaks the guard.
- The arena is the Rusty Creek boss clearing: one flat girder floor, two walls, the creek below. Falling in is a hazard (−1 cell).
- **Death:** she stalls, smokes and dissolves into goo. Dexter appears and absorbs it.
- What we took from Terraria's Wall of Flesh: one huge shape crossing the whole screen, very readable, and you know exactly what to do after seeing it once.

## Later bosses

| Region | Boss | Idea |
| --- | --- | --- |
| 2 | **Drone swarm queen** | The quadcopter at full size; tray-only damage; small drones orbit it |
| 3 | **The Lunch Rush** | The Mensa itself: trays fly, the Leberkäse roll rolls across the lane and stops, exposed |
| 4 | **Mutant planter** | A corten planter with a mouth; the floor turns into sap |
| 5 | **Dexter (8.5 ft)** | Final boss. Black goo, stretching limbs, glitch attacks that copy your own moves (the mimic idea) |
| Secret | **Professors** (replay) | Giant, Moon Lord-scale joke bosses after one completion |

<!-- nav:start -->
[← 04 – World and levels](04-WORLD-AND-LEVELS.md) · [Design docs](README.md) · **5 / 13** · [06 – Visual direction →](06-VISUAL-DIRECTION.md)
<!-- nav:end -->
