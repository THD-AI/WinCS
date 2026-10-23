# Game

Use **Node 22** (`nvm use` reads `.nvmrc`). From this folder:

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Open the local URL printed by Vite. The empty 1280×720 stage starts through
Boot → Preload → Stage, with UI running over Stage. The canvas uses whole-number
display scaling whenever the window can hold the native view; smaller windows
fit the entire view. Production output is `dist/`.

Bootstrap scenes are in `src/core/scaffold.ts` so they do not occupy lane A's
`src/scenes/` or `src/ui/`. Integration can replace them with the story scenes.
Subscribe to `gameEvents` from `src/core/events.ts`; keep the returned unsubscribe
function and call it on scene shutdown.

`public/assets/placeholder/` contains plain coloured rectangles, loaded as Phaser
JSON-hash atlases with `idle-00` frames and feet pivots `(0.5, 1)`, plus matching
`.anims.json` files. Hero: 28×76 body in an 80 px frame; Dexter: 20 px;
rover: 25 px; crab: 40 px; drone: 45 px; Jenny: 200×70.
They are development stand-ins for the [production contracts](../docs/13-PRODUCTION-PIPELINE.md),
and are never copied to `art/`.

Stage exports from lane A belong at `public/assets/stages/<region>/stage.json`.
The loader preserves their list order and scroll factors, caches shared plates,
and loads the named sprite boards from `public/assets/sprites/`. Animation tables
are cached as `<board>.anims`. Development rejects missing assets with their URL;
production reports the error and substitutes a bundled actor or plain stage plate.
Use `?region=rusty-creek&state=anomaly&inspect` on the dev URL to drag-pan the stage.
`state=clean` selects the calm version. Export the assets before starting dev;
the loader does not generate or copy art.

Press **F2** to toggle the authored collision overlay (docs/04 colours). It uses
the same world polylines and boxes that the controller consumes. Collision files
are fetched next to the exported manifest, validated against the chunk and state,
then shifted from chunk-local pixels by the manifest's grid coordinates. Original
metadata is retained; reserved ledges and glide lifts do not become solid surfaces.

Walk with A/D or left/right arrows, or a gamepad stick/D-pad. Holding the same
direction for 0.4 seconds accelerates from 150.5 to 258 px/s (3.5 to 6 m/s).
F2 shows speed, hold time, position and the 28×76 player body. The hero currently
uses the supplied locomotion clips, switching walk/run at contact poses 00 and 04
through the authored bridges. Playback is stepped at 12fps, retaining slower authored
idle and ladder timing, with takeoff and impact holds. After five seconds still,
one of the supplied idle variants plays. F2 shows the current clip and frame.
Space/K or gamepad A/Cross jumps, with about 52px tap height and 96px held height,
0.1s coyote time and 0.12s buffering. Landing uses the drawn landing pose; falls
of at least 152px use the four-frame hard landing. Authored walk polylines follow
slopes through 40°; steeper surfaces accelerate downhill, with jumping still available.
F2 shows the contact slope and slide state. Yellow one-way decks catch falling feet;
Down + Jump drops through them. W/S, up/down arrows or gamepad up/down enter and
move along blue climb zones at 70px/s. Release to hold, move sideways or jump to
leave. `Player.canAttack` is false while climbing. Reserved ledge points stay inactive.

The camera leads movement by up to 120px and eases vertical changes, clamped to
the complete chunk grid. Rendered camera coordinates stay on whole pixels; layers
retain the export's scroll factors. Development `?inspect` keeps manual drag panning
instead of following the hero, for collision review.

Health starts at five cells. Hits grant one second of invulnerability, with a
white flash and flicker, and roughly 64.5px of knockback. Death plays the supplied
collapse clip and pixel dust, then restores full health at the last checkpoint.
Actors register reset callbacks with Player.life; defeated boss ids persist.
Orange hazards damage and return to safe ground; black no-go resets are free.
Development F5 tests a normal hit, Shift+F5 a two-cell hit, Ctrl+F5 a hazard reset,
and Alt+F5 a free no-go reset. These keys are absent from production builds.
