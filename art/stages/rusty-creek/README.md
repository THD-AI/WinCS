# Rusty Creek – stage art

![Rusty Creek, centre chunk](images/after-center.png)

Region 1 of the jam slice ([04 – World and levels](../../../docs/04-WORLD-AND-LEVELS.md)). Three chunks of 2160×720 make a 6480×720 stage, seven registered layers each. The creek, bank, rails and trees come from our [crossings photo board](../../../references/campus/crossings.md). The blue-green riveted girder maze is the anomaly's version of the creek: pathfinding imagery, a nod to the algorithms professor.

## The journey

| Left – entry, first climb | Centre – branches, reconnection | Right – boss clearing, exit |
| --- | --- | --- |
| ![Left](images/after-left.png) | ![Centre](images/after-center.png) | ![Right](images/after-right.png) |

The same place before the anomaly (clean campus architecture, nature layers identical):

| Left | Centre | Right |
| --- | --- | --- |
| ![Clean left](images/before-left.png) | ![Clean centre](images/before-center.png) | ![Clean right](images/before-right.png) |

## Seven layers

| # | Role | Left | Centre | Right | In game |
| --- | --- | --- | --- | --- | --- |
| 01 | Sky / distant trees | [png](images/01-distance-left.png) | [png](images/01-distance-center.png) | = left | Parallax 0.2 |
| 02 | Rear masonry | [png](images/02-supports-left.png) | [png](images/02-supports-center.png) | [png](images/02-supports-right.png) | Scrolls with 05 |
| 03 | Rocky bank | [png](images/03-bank-left.png) | [png](images/03-bank-center.png) | = left | 1.0 |
| 04 | Water / reflection mask | [png](images/04-water-left.png) | [png](images/04-water-center.png) | = left | Hazard zone; reflection clip |
| 05 | Girders and ladders | [png](images/05-traversal-left.png) | [png](images/05-traversal-center.png) | [png](images/05-traversal-right.png) | Collision is authored on top |
| 06 | Near rails | [png](images/06-near-rails-left.png) | [png](images/06-near-rails-center.png) | = left | Foreground 1.1, never collides |
| 07 | Near foliage | [png](images/07-foliage-left.png) | [png](images/07-foliage-center.png) | [png](images/07-foliage-right.png) | Foreground 1.15 |

"= left": shared scenery repeats on the right chunk and is stored once (alias in [media-sources.json](media-sources.json)). The clean architecture plates are [left](images/clean-architecture-left.png) and [centre](images/clean-architecture-center.png); right = left.

## Route

[route.json](route.json) is the authored route: 47 nodes and 47 edges (walk, ladder, jump) covering the entry, the climbs, three dead ends with rewards, a reconnection, the boss clearing and the exit. The verifier checks that it is connected, that every dead end returns, that ladders are vertical and that jumps fit the envelope. The collision data that the game uses is drawn separately: see the colour code in [04](../../../docs/04-WORLD-AND-LEVELS.md).

## Rebuild and verify

```bash
python scripts/creek_layers.py --build   # rebuilds every plate and preview from sources/ + inputs/
python scripts/creek_layers.py           # verifies hashes, alpha, exact recomposition, route graph
```

- `sources/` – the generated scene-first architecture plates, the foliage strip and the two seam-repair candidates
- `inputs/` – fixed earlier plates the stage is built from (far trees, bank, water, rails, clean structure, maze)
- `assembly.json` – mask regions, offsets, draw order · `prompts.json` – exact prompts · `stage.json` + `packet.json` + `repair-report.json` – the seam-repair record · `verification.json` – the last verification

To extend the stage (a new chunk left, right or in the middle), see [09 – Art pipeline](../../../docs/09-ART-PIPELINE.md).
