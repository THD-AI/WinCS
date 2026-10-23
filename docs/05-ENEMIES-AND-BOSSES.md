# 05 – Enemies and bosses

<!-- nav:start -->
[← 04 – World and levels](04-WORLD-AND-LEVELS.md) · [Design docs](README.md) · **5 / 14** · [06 – Visual direction →](06-VISUAL-DIRECTION.md)
<!-- nav:end -->

![Boss – Jenny, the self-driving race car](../art/direction/images/boss-jenny-preview.png)

Every enemy is a real **autonomous** machine from THD – things that already drive, walk or fly by themselves. The anomaly takes over their autonomy: no pilot, no remote, just a self-driving stack that now wants you gone. When one is defeated it stops dead and leaks black fluid, which Dexter absorbs later.

## Regular enemies

| Enemy | Source | Size | HP (chair hits) | Behaviour | Tell | Counter |
| --- | --- | --- | --- | --- | --- | --- |
| **Rover** | THD's autonomous vehicle project (ultrasonic + lidar), yellow wheels | Knee-high (≈ 25 px) | 3 | Patrols a deck. Spots you with its lidar, then charges in a straight line | Lidar turns red, rears up for 0.5 s | Jump over the charge and hit it from behind; guard works |
| **Crab** | Autonomous six-legged hexapod robot | Waist-high, wide (≈ 40 px) | 4 | Creeps toward you; rears up and stabs with its front legs; can walk under decks | Front legs raised for 0.6 s | Step back, then punish; up-attack when it's on a deck above |
| **Drone** | Large autonomous quadcopter | 1 m span (≈ 45 px), flies at head height | 8 (chair) / 3 (tray) | Hovers out of reach and drops screws or sparking batteries; dives when you're under it | Red eye flashes and it tilts | **Avoid it** in Region 1 (hide under girders). Kill it later with the tray. Coming back for drones is intended backtracking |
| *Later:* Mutant plant | Toxic Garden | – | – | Stationary, spits sap | Mouth swells | Down-slam its head |

All of them: contact damage 1 cell, white hit flash, 3–4 frame knockback, and they stop dead and leak black fluid when defeated.

## Boss – Jenny, the self-driving race car (Region 1)

Jenny is **Fast Forest**'s car – THD's Formula Student team, founded 2008. Every car they build is called Jenny; the current one is **Jenny 16GDX** (rolled out 22 May 2026), carbon-black with lime-green, teal and blue stripes. Fast Forest has worked on a **driverless** Jenny since 2017: a camera finds the track's cones and the car steers itself (sources: fast-forest.de, PNP 12 Oct 2023). In the game the cockpit is empty, the blue autonomous-status light on the roll hoop flashes, and the anomaly is doing the driving. 30 chair hits, three phases. The pattern comes straight from the brief: she tries to run you over, crashes into things, sheds parts you have to dodge, slows down, you hit her, she charges up again, and it repeats.

Lex's read (A14), which the fight follows: Jenny is a **shielded** enemy. Her nose is armoured and chair hits bounce off the front. You jump over her charge and hit her **from behind** or while she is stunned. She crashes into the rusted pillars and throws scrap, so there is a ranged threat too. You meet her once before the fight: in clean Rusty Creek she rams you on the bridge, and that is what turns the creek.

| Phase | HP | Pattern |
| --- | --- | --- |
| 1 | 30→20 | **Rev** (1 s, engine shakes, exhaust) → **charge** across the arena → **crash** into the far wall → 3 parts fly out in arcs (spring, bolt, wing shard) → **stunned** 3 s (hazard light blinking): hit her → reboot with green sparks → repeat |
| 2 | 20→10 | Same, but she **charges twice** (turns at the wall) and drops a loose **wheel** that rolls along the floor |
| 3 | 10→0 | She jumps: the charge launches off a ramp in an arc. Jump under it or guard. 5 parts per crash. Stun lasts only 2 s |

- **Charge** does 2 cells. **Parts** do 1. Guarding a charge breaks the guard.
- The arena is the Rusty Creek boss clearing: one flat girder floor, two walls, the creek below. Falling in is a hazard (−1 cell).
- **Death:** she stalls, smokes and leaks black fluid. Dexter appears and absorbs it.
- What we took from Terraria's Wall of Flesh: one huge shape crossing the whole screen, very readable, and you know exactly what to do after seeing it once.

## Later bosses

| Region | Boss | Idea |
| --- | --- | --- |
| 2 | **Drone swarm queen** | The quadcopter at full size; tray-only damage; small drones orbit it |
| 3 | **The Lunch Rush** | The Mensa itself: trays fly, the Leberkäse roll rolls across the lane and stops, exposed |
| 4 | **Mutant planter** | A corten planter with a mouth; the floor turns into sap |
| 5 | **Dexter, the mascot (8.5 ft)** | Final boss. The costume moves like a mascot doing a show – waves, dances, high-fives – and every move is an attack; black fluid sprays from the joins when he's hit; glitch attacks copy your own moves (the mimic idea) |
| Secret | **Professors** (replay) | Giant, Moon Lord-scale joke bosses after one completion |

<!-- nav:start -->
[← 04 – World and levels](04-WORLD-AND-LEVELS.md) · [Design docs](README.md) · **5 / 14** · [06 – Visual direction →](06-VISUAL-DIRECTION.md)
<!-- nav:end -->
