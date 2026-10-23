# 07 – Asset manifest

<!-- nav:start -->
[← 06 – Visual direction](06-VISUAL-DIRECTION.md) · [Design docs](README.md) · **7 / 14** · [08 – Tech stack and where things live →](08-TECH-STACK.md)
<!-- nav:end -->

Every asset the jam slice needs, with frame counts. **Status:** ✅ approved · 🟡 drawn, in review · ⬜ to do. "Board" is the sprite board in `art/sprites/boards.json`; game-ready atlases are exported from boards into `game/public/assets/`.

Sprite boards come **after** the [visual direction](06-VISUAL-DIRECTION.md) is approved, and every board takes the style master as an input.

The frame lists below were reviewed by the team on 23 Oct ([A14](meetings/transcripts/A14.md)). Every animation is delivered as a **reusable sprite sheet** built from layers and masks, so it can be revised later, and each one gets a preview of how it looks in the game. How we keep generated frames from looking rubbery is in the [art pipeline](09-ART-PIPELINE.md#smooth-not-rubbery).

## Characters

| Asset | Board | Animations (frames) | Status |
| --- | --- | --- | --- |
| Hero design sheet | `hero` | Turnaround ×5, hood close-up, THD crest, scale lineup | ✅ |
| Hero – walk | `hero-move` | idle 6 · idle→walk 2 · walk 8 | ✅ |
| Hero – run | `hero-run` | walk→run 2 · run start 3 · run 8 | ✅ |
| Hero – idle variants | `hero-idle` | look around 4 · check the tablet 4 · check wounds 4 | ✅ |
| Hero – air & climb | `hero-air` | jump 9 · fall 3 · hard landing 4 · ladder 4 (seen from behind) | ✅ |
| Hero – hurt & interact | `hero-hurt` | hit 8 (cartoonish, simple) · knockback 3 · interact 3 · pick up 4 · look at device 3 | ✅ |
| Hero – death | `hero-death` | death 12 (two rows of 6) | ✅ |
| Hero – chair | `chair-side`, `chair-overhead`, `chair-block` | side sweep A 8 · side sweep B 8 (the return swing) · up attack 6 · down slam 7 · recoil 2 · air pogo 4 · guard up 4 · guard hold 3 · guard impact 4 · guard break 4 · chair pickup 1 | ✅ |
| Hero – tray (post-jam) | `tray-throw` | throw 6 · tray spin 8 · catch 4 | ⬜ |
| Hero – anomaly crossing | – | none extra: reuses hit + knockback; the THD.exe window is UI | ✅ by design |
| Dexter (plush) | `dexter` | idle 3 · hop 4 · walk 6 · point at the ground 3 · shove 4 · beckon 3 · bow · sweat · proud · creepy shadow. More for the boss fights later | ⬜ |
| Dexter (final) | `dexter` | stand · menace · lunge | ⬜ |

## Enemies and boss

Frame lists approved as they are (A14).

| Asset | Board | Animations | Status |
| --- | --- | --- | --- |
| Rover | `enemy-rover` | idle 4 · drive 6 · spot + charge 4 · hit/flip/wreck 5 | 🟡 |
| Crab | `enemy-crab` | idle 4 · walk 8 · rear + stab 5 · collapse 5 | 🟡 |
| Drone | `enemy-drone` | hover 4 · alert/dive 3 · crash 5 · dropped screw 3 | 🟡 |
| Jenny | `boss-jenny` | rev 4 · charge 4 · crash 4 · stunned 3 · reboot 2 · debris ×5 (2 each) | ⬜ |
| Black-fluid leak (shared death FX) | `fx` | 6 | 🟡 |

## Items, props, UI

| Asset | Board | Notes | Status |
| --- | --- | --- | --- |
| Food pickups | `mensa-food` | muffin, cake, wafer, Leberkäse roll; 16 px icons + sparkle. Approved (A14) | ⬜ |
| Drinks + coffee machine (save point) | `mensa-drinks` | coffee machine idle/flicker/pour | ⬜ |
| Pocket computer | `pocket-computer` | pickup + 3 screen mockups (map, archive, menu) | ⬜ |
| Sign pole (post-jam weapon) | `wayfinder` | prop, pull-out 5, thrust 5 | ⬜ |
| Campus robot (collectible companion, post-jam) | `companion-robot` | idle 4 · drive 6 · hop/scan/sleep | ⬜ |
| HUD | – | 5 battery cells (full/cracked/empty), glitch meter 3 segments, boss bar. Approved (A14) | ⬜ |
| Crash window "THD.exe has stopped responding." | – | grey window, blue title bar, red X, OK; real game text. Approved (A14) | ⬜ |
| Glitch FX | – | image cut, pixel stretch, 404 void (shader or sprite slices) | ⬜ |

## Stages

| Stage | Plates | Status |
| --- | --- | --- |
| Rusty Creek | 3 chunks × 7 layers, clean + anomaly states, route graph | ✅ art · ⬜ collision · ⬜ foreground-blur + particle layers |
| Stage concepts (6 regions × clean/anomaly) | 2176×1088 concepts with up/down routes ([art/locations](../art/locations/README.md)) | 🟡 in review |
| Hidden Garden (prologue) | 2–3 chunks (about 3 minutes of play), layer stack + collision, from its stage concept and Lex's layout | ⬜ |
| Jenny's arena | right chunk of Rusty Creek (boss clearing) | ✅ art · ⬜ collision |

## Audio (to source during the jam)

Footsteps (girder, grass), chair whoosh + hit, rover motor, crab servos, drone hum, Jenny engine + crash, fluid absorb, crash-dialog "ding", one ambient loop per region, one boss loop. Use CC0 sources only and record every source in `NOTICE.md`.

<!-- nav:start -->
[← 06 – Visual direction](06-VISUAL-DIRECTION.md) · [Design docs](README.md) · **7 / 14** · [08 – Tech stack and where things live →](08-TECH-STACK.md)
<!-- nav:end -->
