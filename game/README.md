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
and are never copied to `art/`. No gameplay, HUD, or collision is included yet.
