# Art direction exploration and asset contract

[← Previous](../proposal/mechanics-and-level.md) · [🏠 Home](../../README.md) · [🖼️ Visual library](../../references/README.md) · [Next →](../technical/technical-proposal.md)

Status: provisional production constraints, not a final visual identity. Choose mechanics and camera before drawing a full cast. Vatsal selects two favorite gameplay screenshots from the Hollow Knight/9 Years references and says what reads well; Lex decides a comfortable contribution size.

## Two directions to compare after the loop is chosen

| Direction | Borrowed quality, not copied content | Production implication |
| --- | --- | --- |
| Quiet, strange, luminous | Hollow Knight silhouette separation; Animal Well's environmental mystery; original pixel execution | Dark restrained backgrounds, clear foreground collision, one bright interactable accent; no darkness that hides platforms |
| Warm, absurd little world | Kingdom's layered depth and Children of Morta's warm focal lighting | One warm focal color against cool background; humor in props; keep combat readability if chosen |

Do not combine every game's palette. Side-view gameplay references take priority over top-down character proportions. Planet of Lana is composition/negative-space reference, not a pixel-art production template. Dead Cells' technique is research, not a requirement to build a 3D-to-2D animation pipeline.

## Candidate asset budget to approve

- Working resolution proposal: 320×180 logical pixels, integer scale where possible; 16×16 terrain cells; player up to 24×32. Spike this once with actual collision and camera before locking it.
- One palette of roughly 12–20 colors plus transparency, with separate values for collision surfaces, background and interactables. Counts are budgets, not artistic rules.
- Player: idle 2 frames, run 4, jump 1, fall 1, ability 2, hurt/reset 1: **11 unique frame slots** before reuse. One horizontal facing mirrored unless asymmetry matters. At 24×32 this is a compact sheet; sheet layout/export naming must be explicit.
- One tileset: solid/platform variants, ledge caps, corners, background wall and 3–5 props. One biome with two background layers is enough.
- One ability pickup, one gate marker, one hazard, goal marker; a few UI glyphs. No boss or NPC cast.
- Audio: one short optional ambient loop, jump/land, pickup/ability, hurt/reset, win (some can share). Mute and user-gesture audio start required.

Frame count is a draft cost estimate. Lex may offer fewer frames; the fallback is a static original sprite with movement feedback, never pressure to finish a commercial-quality animation set.

## Export and integration contract

Before parallel asset work, agree PNG transparency, exact cell dimensions, origin/foot position, frame order, names and FPS; collision shapes are independent data, never inferred from transparent pixels. Use `player_idle.png`, `player_run.png`, `terrain.png` as illustrative filenames; final atlas format follows the chosen engine. Nearest-neighbor sampling, pixel alignment and no accidental blur. Test a single exported frame in the running scene before producing all animations.

Keep editable source separate from exported runtime PNGs. Record author, date, source tool, edits, license/permission, intended use and AI generation provenance in the runtime manifest. AI outputs still need consistent silhouettes, frame sizes, cleaned transparency, temporal consistency and organizer permission. Do not assume generating a sheet makes it animation-ready.

## Provenance template

| Runtime path | Author / source | License / permission | AI tool/model if used | Human edits | Verified by |
| --- | --- | --- | --- | --- | --- |
| No runtime assets yet | – | – | – | – | – |

Reference screenshots live under references/, never public/ or an exported build. Any later build script should enforce that boundary.

[← Previous](../proposal/mechanics-and-level.md) · [🏠 Home](../../README.md) · [🖼️ Visual library](../../references/README.md) · [Next →](../technical/technical-proposal.md)
