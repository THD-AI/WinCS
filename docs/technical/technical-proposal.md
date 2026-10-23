# Technical proposal and delivery architecture

[← Previous](../design/art-and-audio.md) · [🏠 Home](../../README.md) · [🖼️ Visual library](../../references/README.md) · [Next →](engine-evidence.md)

Status: **proposed**, no engine installed. See [engine evidence](engine-evidence.md) for primary documentation and current constraints.

**22 October extension:** [layered-stage contract](layered-stage-contract.md) covers banner origins/parallax, independent collision, lake anchors, safe transitions, collectible state and interior reveals. Use it to scope the spike. Generated layers alone do not solve collision, animation or cross-device support; no runtime implementation is included.

## Choose by a small spike, not language folklore

Provisional recommendation: **TypeScript + Vite + Phaser**, a static single-player browser build. Phaser supplies scenes, input, cameras, animation and 2D collision facilities; that saves manual integration only if the team can use them. Vatsal's Python knowledge does not imply JavaScript familiarity. Pair on one small state or interaction rather than hand him an unexplained framework.

Compare Phaser against Godot web export if someone can comfortably own Godot setup. Plain Canvas is an alternative for a very small one-room interaction, but hand-written collision, asset loading and scene lifecycle are real work. Unity is valid for 2D if the team already knows it; its installation/export workflow must fit the available time. Three.js is unnecessary for the proposed 2D loop. No performance claim can be decided from language choice alone.

**Spike acceptance (30–45 min after rules allow):** clean clone/build, a rectangle walking and jumping on solid tiles, bounded camera, reset, load one PNG, launch the exported build in a second browser. Test the final host's path prefix and keyboard focus. If setup fails, simplify the loop or choose the familiar tool; do not spend half the jam swapping engines.

## Proposed runtime boundaries

| Area | Responsibility |
| --- | --- |
| boot / loading | Asset manifest, clear load error, audio unlock |
| game scene | Map, spawn, camera, update loop; no React rerender loop |
| player controller | Input intent, grounded/motion state, one ability |
| world objects | Gate, hazard, interaction, goal |
| session state | Ability earned, checkpoint, paused/won; reset contract |
| UI | Controls, pause/mute, restart, short dialogue if chosen |

Use one authored level and simple data objects. Avoid plugin ecosystems, backend services, authentication, analytics, multiplayer and asset-management infrastructure. Commit a lockfile when dependencies are introduced. Pin the actual versions selected at implementation time, not guesses in these notes.

## Performance and reliability checks

Target smooth play on the team's ordinary student laptops. Measure frame pacing during movement and hazards; do not promise 60 fps before a build exists. Minimize texture size and draw work first. Start with one small atlas and no dynamic lighting or shader stack. Background decoration never changes collision. Pause/background tab behavior must not send the player through a floor after a large delta. Use the chosen engine's timestep deliberately.

## Hosting decision proposal

- Keep source and planning private on GitHub. Private source does not imply a published static game is private.
- Candidate final host: itch.io HTML5 ZIP with index.html and relative asset paths, subject to organizer format and account access. The team's own account must own the submission.
- Candidate review host: a static preview on an already authorized service, or a local exported build on another laptop. No hosting account, billing resource, public site or deployment has been created in this planning task.
- GitHub Pages from a private repository depends on plan/organization settings and publishes accessible output; do not assume it solves privacy. Avoid copying Voyager's private-to-public repository pipeline for this small jam.
- First exported test before Friday evening, freeze final build before Saturday 11:30, keep a ZIP and short recording as backups. An organizer deadline overrides this plan.

## Optional Flipper research boundary

Treat a hardware version as a separate future design. Its small monochrome display, limited memory/input and native application environment change art, controls and runtime architecture. A browser/WebGL build is not an FAP binary. Preserve a simple core loop if desired; do not constrain the jam to support two platforms.

[← Previous](../design/art-and-audio.md) · [🏠 Home](../../README.md) · [🖼️ Visual library](../../references/README.md) · [Next →](engine-evidence.md)
