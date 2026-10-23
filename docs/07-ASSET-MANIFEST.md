# 07 – Asset manifest

<!-- nav:start -->
[← 06 – Visual direction](06-VISUAL-DIRECTION.md) · [Design docs](README.md) · **7 / 13** · [08 – Tech stack and where things live →](08-TECH-STACK.md)
<!-- nav:end -->

Every asset the jam slice needs, with frame counts. **Status:** ✅ approved · 🟡 drawn, in review · ⬜ to do. "Board" is the sprite board in `art/sprites/boards.json`; game-ready atlases are exported from boards into `game/public/assets/`.

Sprite boards come **after** the [visual direction](06-VISUAL-DIRECTION.md) is approved, and every board takes the style master as an input.

## Characters

| Asset | Board | Animations (frames) | Status |
| --- | --- | --- | --- |
| Hero design sheet | `hero` | Turnaround ×5, hood close-up, THD crest, scale lineup | ✅ |
| Hero – movement | `hero-move` | idle 6 · walk 8 · run 8 | ⬜ |
| Hero – air & climb | `hero-air` | jump 7 · fall 3 · hard landing 4 · ladder 6 · ledge pull-up 4 | ⬜ |
| Hero – hurt & interact | `hero-hurt` | hit 4 · knockback 3 · death 6 · interact 3 · pick up 4 · look at device 3 | ⬜ |
| Hero – chair | `chair-side`, `chair-overhead`, `chair-block` | side sweep 8 · up attack 6 · down slam 7 · air pogo 4 · guard up 4 · guard hold 3 · guard impact 4 · guard break 4 | ⬜ |
| Hero – tray (post-jam) | `tray-throw` | throw 6 · tray spin 8 · catch 4 | ⬜ |
| Hero – anomaly crossing | `intro-anomaly` | starfish spin 6 (reuses hit + knockback) | ⬜ |
| Dexter (plush) | `dexter` | idle 3 · hop 4 · beckon 3 · bow · sweat · proud · creepy shadow | ⬜ |
| Dexter (final) | `dexter` | stand · menace · lunge | ⬜ |

## Enemies and boss

| Asset | Board | Animations | Status |
| --- | --- | --- | --- |
| Rover | `enemy-rover` | idle 4 · drive 6 · spot + charge 4 · hit/flip/wreck 5 | ⬜ |
| Crab | `enemy-crab` | idle 4 · walk 8 · rear + stab 5 · collapse 5 | ⬜ |
| Drone | `enemy-drone` | hover 4 · alert/dive 3 · crash 5 · dropped screw 3 | ⬜ |
| Jenny | `boss-jenny` | rev 4 · charge 4 · crash 4 · stunned 3 · reboot 2 · debris ×5 (2 each) | ⬜ |
| Black-fluid leak (shared death FX) | `fx` | 6 | ⬜ |

## Items, props, UI

| Asset | Board | Notes | Status |
| --- | --- | --- | --- |
| Food pickups | `mensa-food` | muffin, cake, wafer, Leberkäse roll; 16 px icons + sparkle | ⬜ |
| Drinks + coffee machine (save point) | `mensa-drinks` | coffee machine idle/flicker/pour | ⬜ |
| Pocket computer | `pocket-computer` | pickup + 3 screen mockups (map, archive, menu) | ⬜ |
| Sign pole (post-jam weapon) | `wayfinder` | prop, pull-out 5, thrust 5 | ⬜ |
| Campus robot (collectible companion, post-jam) | `companion-robot` | idle 4 · drive 6 · hop/scan/sleep | ⬜ |
| HUD | – | 5 battery cells (full/cracked/empty), glitch meter 3 segments, boss bar | ⬜ |
| Crash dialog | – | grey title bar, red X, OK button; text is real text rendered by the game | ⬜ |
| Glitch FX | – | image cut, pixel stretch, 404 void (shader or sprite slices) | ⬜ |

## Stages

| Stage | Plates | Status |
| --- | --- | --- |
| Rusty Creek | 3 chunks × 7 layers + clean architecture, route graph | ✅ art · ⬜ collision |
| Location strips (7 regions) | 2160×720 strip + left/right extension each ([art/locations](../art/locations/README.md)) | 🟡 drawn, in review |
| Hidden Garden (prologue) | 1–2 chunks × 7 layers, split from its location strip | ⬜ |
| Jenny's arena | right chunk of Rusty Creek (boss clearing) | ✅ art · ⬜ collision |

## Audio (to source during the jam)

Footsteps (girder, grass), chair whoosh + hit, rover motor, crab servos, drone hum, Jenny engine + crash, fluid absorb, crash-dialog "ding", one ambient loop per region, one boss loop. Use CC0 sources only and record every source in `NOTICE.md`.

<!-- nav:start -->
[← 06 – Visual direction](06-VISUAL-DIRECTION.md) · [Design docs](README.md) · **7 / 13** · [08 – Tech stack and where things live →](08-TECH-STACK.md)
<!-- nav:end -->
