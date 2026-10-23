# 04 – World and levels

<!-- nav:start -->
[← 03 – Story and cast](03-STORY-AND-CAST.md) · [Design docs](README.md) · **4 / 13** · [05 – Enemies and bosses →](05-ENEMIES-AND-BOSSES.md)
<!-- nav:end -->

![Hidden Garden – where it starts](../art/direction/images/hidden-garden-preview.png)

## The world

Every region is a real THD Deggendorf place we photographed on 22–23 Oct, rebuilt as a flat side view and then broken by the experiment. The [location collages](../references/campus/README.md) are the source for each one.

| # | Region | Real place | Anomaly that leads in | New weapon / upgrade | Boss | Jam slice? |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | **Hidden Garden** (prologue) | Garden and pond behind the campus | – | – | – | ✅ |
| 1 | **Rusty Creek** | The creek, steel bridges, rails and riveted girders | The pond | Chair; pocket computer | **Jenny** (race car) | ✅ |
| 2 | **Lost in the Green** | Ornamental grasses, birches, stone-slab paths | Granite obelisk | Tray; double jump | Drone swarm queen | – |
| 3 | **Campus / Mensa** | Pink-render buildings, the scaffolded Mensa facade, cafeteria | Black goo puddle | Sign pole; tray recall | The Lunch Rush (Mensa) | – |
| 4 | **Toxic Garden** | Corten planters, granite, the greenhouse feel of Dead Cells | Playground slide | Wall-slide | Mutant planter | – |
| 5 | **Playground** | The adventure playground | – | – | **Dexter** | – |

Stepping-stone creek and Playground slides work as connectors (fast travel between anomalies you have already crossed), as Lex proposed.

## How a region is laid out

- **Left to right, but not only.** Each region is a row of 2160×720 chunks; Rusty Creek has three (6480×720). Chunks can grow left, right or in the middle, and later up and down (see the [art pipeline](09-ART-PIPELINE.md)).
- **Every region contains** a quiet entry; a first fight; at least two branches, one of them a dead end that rewards you (food, note); a coffee machine save point; a reconnection back to the main route; a boss clearing; an exit anomaly.
- **Not symmetrical, not chaotic.** Lex designs routes by hand on top of the stage art: hills, rooms, secrets, encounters. AI art fills the look; it doesn't design the level.
- **Hills like Planet of Lana and Ori.** Smooth ground lines, no blocky staircases.

## Scale – the numbers everything follows

| Thing | Real size | Stage pixels (stage is 720 px tall) |
| --- | --- | --- |
| Screen | – | 1280×720 view of a 720-tall stage (pixel grain 2 px) |
| Hero | 6 ft / 1.83 m | **80 px tall**, body box 28×76 |
| 1 ft | 0.30 m | ≈ 13 px |
| Dexter (plush) | 1.5 ft | 20 px |
| Dexter (final) | 8.5 ft | 113 px |
| Chair seat height | 0.45 m | 20 px |
| Jump (tap / hold) | 1.2 m / 2.2 m | 52 px / 96 px |
| Ladder rung spacing | 0.3 m | 13 px |

`route.json` in Rusty Creek still records an older 18×32 body. Collision authoring replaces it with the 28×76 box above.

## Collision and interaction annotation

Each stage gets one colour-coded annotation layer drawn on top of the art (this was asked for in the meeting). The game loads it as data; the colours are only for authoring:

| Colour | Meaning |
| --- | --- |
| 🟩 Green line | Walkable ground / slope (solid from above and the sides) |
| 🟨 Yellow line | One-way platform (girder decks, scaffold planks) |
| 🟥 Red box | Solid wall / ceiling |
| 🟦 Blue box | Ladder zone |
| 🟪 Purple box | Interactable / trigger (coffee machine, pickup, Dexter, anomaly, boss gate) |
| 🟧 Orange box | Hazard (creek current, sap, spikes) |
| ⬜ White dot | Spawn point (player, enemy, item) |

Export: `art/stages/<region>/collision.json`, which holds polylines and boxes in stage pixels. The pixel masks never stand in for collision; somebody draws it.

## Rusty Creek – the jam level

![Rusty Creek – full route, three chunks](../art/stages/rusty-creek/images/after-left.png)

The route already exists as a graph ([route.json](../art/stages/rusty-creek/route.json): 47 nodes, 47 edges, verified connected). The beats on it:

| Chunk | Beat | Content |
| --- | --- | --- |
| Left – *entry, first climb* | Land from the pond crash. Quiet. | The **chair** lies on the first deck. One **rover** patrols the low deck (tutorial fight). Ladder up to the first branch. Optional lookout dead end: muffin + note #1 |
| Center – *branches, reconnection* | The maze opens up | Two routes: high (ladders, a **walker** on a deck) and low (along the creek, two rovers). A **drone** hovers over the low route: too hard to kill with the chair, so avoid it under girders. **Coffee machine** + **Dexter** (pocket computer) at the reconnection. Cache dead end: Leberkäse roll |
| Right – *boss clearing, exit* | Wide open girder floor | Boss gate closes behind you. **Jenny**. After the fight, Dexter absorbs the goo and the exit anomaly opens. Overlook dead end: note #2 (first hint about Dexter) |

Target play time for the slice: 8–12 minutes.

## Lex's next maps

For each next region: one hand-drawn route sketch on top of its collage. Mark the entry, branches, secrets, enemies and the boss room with arrows, using the colour legend above. Screenshots from reference games are welcome. These sketches are the input for generating that region's stage art.

<!-- nav:start -->
[← 03 – Story and cast](03-STORY-AND-CAST.md) · [Design docs](README.md) · **4 / 13** · [05 – Enemies and bosses →](05-ENEMIES-AND-BOSSES.md)
<!-- nav:end -->
