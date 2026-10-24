# 01 – Proposal

<!-- nav:start -->
[← Design documents](README.md) · [Design docs](README.md) · **1 / 15** · [02 – Game design →](02-GAME-DESIGN.md)
<!-- nav:end -->

![Rusty Creek – our first stage, current art](../art/stages/rusty-creek/images/after-center.png)

> **A familiar campus. A plush mascot that wants you to keep fighting. A quantum experiment that broke the pond.**

## The pitch

You are a first-year student at THD Deggendorf, hood up, poncho on. Nobody ever sees your face. On a quiet afternoon you find **Dexter**, the university's black panther mascot plush, sitting by the Hidden Garden pond. He hops away like the White Rabbit, and you follow him to the pond. Its reflection is wrong. You lean in, and the little plush gives you a shove. You take damage, get lifted into the air spinning like a starfish, and a Windows-style crash dialog freezes the screen. Then you land somewhere that is almost the campus, and isn't.

A quantum-computing field experiment has torn the campus into overlapping dimensions. Each region is a familiar place that has become uncanny. Ordinary campus objects are your weapons: a plywood chair, a cafeteria tray, a road sign. THD's **autonomous** machines – the lab rover, the hexapod crab robot, the quadcopter drone and Jenny, Fast Forest's driverless race car – have had their self-driving taken over by **anomalies**. Dexter keeps turning up. He never speaks and never fights: he bows, points, leaves food on your path, hands you upgrades and quietly absorbs every anomaly you defeat. He grows each time.

**Genre:** 2D side-scrolling exploration-action (light Metroidvania). **Camera:** flat side view; the hero is small in a wide world, like Planet of Lana. **Look:** detailed hi-bit pixel art. **Tone:** a **secret horror game** – it plays and looks like a cozy campus adventure, and the horror is hidden in plain sight: details that are slightly wrong, a mascot that is a little too friendly. No gore, no jump-scare spam, no apocalypse. **Platform:** browser, deployed on Vercel.

**Jam theme:** "spooky outside", as participants reported it in the 23 Oct meeting. The keynote wording still needs confirming on site.

## Working title

**DEGGSTER.EXE** – *"has stopped responding."* (placeholder)

The mascot is the secret villain, and a crash dialog is the transition between worlds, so the title is the twist hidden in plain sight. In the 23 Oct review (A14) the team said it **needs more work**: too obvious, and it should read a little ironic to someone who doesn't know the twist. Suggestions so far: *Deggendorf Simulator* (Vatsal), *Pond Not Found*, *Field Experiment*, *Office Hours: Out of Bounds*. Nobody has checked yet whether these names are taken. The team picks the title together; see [decisions](11-DECISIONS.md).

Team name: **Poncho Goblins** (registered as Septim Goblins).

## Pillars

1. **Familiar first, wrong second.** Every region starts as a real place we photographed. Then it breaks in a specific, readable way: image cuts, stretched pixels, 404 voids. Never random noise.
2. **Ordinary objects, unreasonable solutions.** The chair, the tray and the sign are real objects we posed with on campus. Each one adds a verb: a melee swing, a returning throw, a heavy thrust.
3. **Small figure, big world.** The hero is about 1/8 of the screen tall. The scenery is the main character until the bosses arrive.
4. **The friend is the threat.** Dexter helps you all game. The player should feel the betrayal coming half a step before it lands.

## What we take from the games we love

| Game | What we loved | What it becomes here |
| --- | --- | --- |
| Hollow Knight (Vatsal) | Lonely exploration, readable silhouettes, benches, map you earn | Coffee machine save points; the pocket computer is the map you earn; rim-lit silhouettes |
| Planet of Lana | A small figure in a huge, layered, painterly world; soft hills | 7-layer parallax stages; hero at 1/8 screen height; hills, not blocks |
| Dead Cells | The overgrown arboretum; punchy combat; boss designs | Toxic Garden; hit-stop and knockback on every chair swing |
| Little Nightmares | The small hooded figure; the betrayal by an ally | Faceless hooded hero; Dexter's betrayal |
| 9 Years of Shadows (Lex) | Rich pixel scenery | Hi-bit pixel density for stages |
| Kingdom Two Crowns | Pixel water reflections; the Greed's black goo | Pond reflection anomaly; black fluid seeping from possessed machines |
| Terraria | Wall of Flesh / Moon Lord: huge, simple, readable bosses | Jenny, the self-driving race car |
| Children of Morta | Concentrated, colourful effects | Impact bursts, glitch FX |
| Duck Season | A friendly mascot costume that is wrong on a second look; secret horror | Dexter's final form is the mascot costume, leaking where its pieces join; multiple endings later |
| Monkey Island (classic) | Pixel charm, jokes you do, not read | Interactions with a payoff; no wall-of-text jokes |
| Infinity Blade | Advanced tech read as ancient relics | The experiment's hardware feels like temples and artefacts |

The full research notes are in [what we love](research/what-we-love.md).

## Scope for the jam

The jam runs Fri 23 Oct 14:00 → Sat 24 Oct 11:30 (jury). We build **one vertical slice** and stop:

1. **Prologue – Hidden Garden**, about 3 minutes (a calm walk, Dexter, the pond, the shove, the crash)
2. **Region 1 – Rusty Creek**: the clean creek, then Jenny rams you and the creek turns into the rust maze. This is where you learn everything (jump, climb, ladders, the chair, the first enemies); Dexter's apology and the pocket computer; boss: **Jenny**
3. Credits card with a "to be continued" glitch and a first creepy hint about Dexter

Everything else in this folder is the full game, kept so the jam slice is built on a design that can keep growing. The cut order is in the [jam plan](10-JAM-PLAN.md).

## Team

| Person | Role in the jam |
| --- | --- |
| Vatsal | Creative lead; gameplay programming (movement, combat) |
| Lex | Level design (routes, secrets, encounters on the stage art), sprites review |
| Alexander | Pipeline, art generation, build/deploy, integration |

<!-- nav:start -->
[← Design documents](README.md) · [Design docs](README.md) · **1 / 15** · [02 – Game design →](02-GAME-DESIGN.md)
<!-- nav:end -->
