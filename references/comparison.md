# What correlates, what conflicts, what costs time

[← Previous](README.md) · [🏠 Home](../README.md) · [🖼️ Visual library](README.md) · [Next →](../docs/design/play-and-puns.md)

This is our design analysis of the linked [reference library](README.md), not a ranking of the games or a locked pitch. Prioritize Vatsal's taste. Shared appearance does not imply shared game logic or production tools.

**22 October synthesis:** [local location boards](campus/README.md) supply materials; Planet of Lana supplies composition/depth; Little Nightmares supplies vulnerable scale; Playground supplies familiar play spaces turned unsettling; Terraria supplies side-view terrain/encounter comparisons; Monkey Island supplies interaction humor; Infinity Blade supplies replay reinterpretation; Duck Season supplies mascot unease. These are roles to study, not seven systems to combine. The [garden/lake proposal](../docs/proposal/campus-game.md) selects one small interaction from that vocabulary.

| Family | References | Shared quality | Useful tiny translation | Dependencies to avoid importing |
| --- | --- | --- | --- | --- |
| Ability-led exploration | Hollow Knight, 9 Years of Shadows, Metroid Dread | Revisit a place with a new capability | One visible ledge, one unlock, one return | Large maps, multiple abilities, map UI, bosses |
| Environmental discovery | Animal Well, some Hollow Knight moments | Observe, experiment, reinterpret | One object behaves consistently in two contexts | Many tools, opaque puzzle chains, secret endings |
| Combat excursions | Soul Knight, Dead Cells, Children of Morta | Clear threats, action feedback and retry | One enemy tell and one response, if chosen | Weapon inventories, random generation, character rosters |
| Side-view indirect strategy | Kingdom Two Crowns, Kingdom Eighties | Tiny input vocabulary, meaningful investment | One action causes visible change | Economy, recruit AI, defense waves, day/night balance |
| Place and care | Stardew Valley, Children of Morta, Drova | People/routines make actions matter | One recurring prop and a changed return | Faction state, relationship meters, schedules, farming |
| Cinematic environmental narrative | Planet of Lana | Small figure in a legible large world | One carefully framed reveal | Companion AI, cinematics and bespoke puzzle sequence |
| Direct platformer clarity | Apple Knight | Immediate movement and obstacle reading | Short authored route with obvious feedback | Content volume and generic copied identity |

## Strong correlations

- A return route can serve progression **and** narrative: the same location reads differently after a new ability or one discovered fact. This reuses art while giving a small world depth.
- Readable silhouettes and foreground/background separation help exploration, action and puzzle games alike. These are better cross-reference targets than copying palettes wholesale.
- Restricted verbs reduce onboarding. They do not necessarily reduce simulation cost: Kingdom's few buttons sit on top of many interacting systems.
- A small environmental joke can share an asset with the ending's emotional beat. “Funny but deep” can mean a changed interpretation, not two separate content pipelines.

## Conflicts to decide explicitly

- Top-down combat needs different directional sprites and spatial logic from a side-view platformer. Morta, Drova, Stardew and Soul Knight cannot simply donate their camera grammar to Vatsal's chosen side-scroller.
- Precision combat invites repeated failure; relaxed discovery may need forgiving retry and minimal interruption. Choose the intended emotional rhythm before adding enemies.
- Pixel art, hand-drawn animation, painted landscapes and 3D-derived sprites are distinct workflows. Hollow Knight's style preference does not require its original art technique.
- Metroidvania exploration, roguelite resets and strategy persistence have incompatible default state lifecycles. Define what resets on death and which ability persists before implementation.
- A goldfish memory-reset concept could conflict with permanent ability progression. If chosen, design that relationship first; do not add resets as a title-driven gimmick.

## Proposed dependency chain

`camera + controls → movement/collision → reachable room geometry → one unlock/gate → reset/win → final art dimensions and animations → polish`

Theme and core player experience precede the chain. Art exploration can run alongside a greybox, but final animation work should wait until player scale, states and pivots are agreed. A fixed canvas resolution alone does not decide the visual direction.

## Smallest differentiator

Ask Vatsal to finish: “You are a ___ who can ___, but ___.” If the answer could describe every platformer, make the interaction or consequence specific. Originality should come from one coherent relationship between verb, world and outcome. Do not solve the Apple Knight comparison by adding five unrelated mechanics.

[← Previous](README.md) · [🏠 Home](../README.md) · [🖼️ Visual library](README.md) · [Next →](../docs/design/play-and-puns.md)
