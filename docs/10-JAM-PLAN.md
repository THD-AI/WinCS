# 10 – Jam plan

<!-- nav:start -->
[← 09 – Art pipeline](09-ART-PIPELINE.md) · [Design docs](README.md) · **10 / 14** · [11 – Decisions →](11-DECISIONS.md)
<!-- nav:end -->

**DEGDEV 3**, Deggendorf: Fri 23 Oct 14:00 → Sat 24 Oct 13:30. Jury voting starts at **11:30 Saturday**, and that is our hard stop. Event facts: [research/degdev-3.md](research/degdev-3.md).

## Timeline

| When (Fri → Sat) | Goal | Done when |
| --- | --- | --- |
| Fri 15:30–18:40 (Sprint 1) | References, recordings, design docs, visual direction, stage concepts, repo clean | This folder, reviewed by the team ✅ |
| **18:40–20:30** | **[Issue board](https://github.com/orgs/THD-AI/projects/7)**: six milestones (M0 setup → M1 movement → M2 combat → M3 prologue → M4 Rusty Creek + Jenny → M5 polish + submit), one epic each with sub-issue stories, every story with acceptance criteria and its blockers; the reusable pipelines (layer split, chunks in four directions, collision annotation) sit in M0. How to pick work: [12 – Team workflow](12-TEAM-WORKFLOW.md) | Board live, everyone has a first issue ✅ |
| 19:30–20:00 | Pizza. Walk the board together; lock the title | Decisions logged |
| 20:00–00:00 (Sprint 2) | `game/` scaffold on Vercel · player controller (walk, run, jump, slopes, ladders) on Rusty Creek collision · sprite boards from the approved direction | Hero moves on the real stage, on a preview URL |
| 00:30–03:00 | Chair combat (3 attacks + guard) · rover + crab AI · health/death/respawn · coffee machine save · clean → anomaly switch | You can fight through chunk 1 |
| 03:00–07:00 | Prologue (Hidden Garden walk, Dexter, pond, THD.exe crash) · Jenny boss · drone · pickups · HUD | Full slice playable start to finish |
| 07:00–08:00 | Breakfast. **Playtest by someone outside the team** | Bug list |
| 08:00–11:00 | Fix · sound · juice (hit-stop, shake, falling leaves, foreground blur) · title + credits · final deploy | Production URL stable |
| 11:00–11:30 | Freeze. Submit. Rehearse the 2-minute demo | – |

## The two-minute demo

The jury sees two minutes; we decide now what they see ([#75](https://github.com/THD-AI/WinCS/issues/75)). One person plays, one talks; the suggestion is **Vatsal plays, Alexander talks** – the team confirms at the 11:00 rehearsal. Play the **production URL** (https://wincs.vercel.app) full screen (F11) with sound on.

| Time | On screen (played live) | Said |
| --- | --- | --- |
| 0:00–0:15 | Title: **DEGGSTER.EXE** – *has stopped responding.* → Start | "A familiar campus, a plush mascot that wants you to keep fighting, and a quantum experiment that broke the pond. We're the Poncho Goblins." |
| 0:15–0:40 | Hidden Garden: Dexter hops ahead, the pond's wrong reflection, the shove → **THD.exe has stopped responding.** → OK | "You never see the hero's face. Dexter never speaks – he points, bows, shoves. Crossing between worlds is a crash dialog." |
| 0:40–1:05 | Clean Rusty Creek, the bridge → **Jenny rams you** → the creek turns: image cuts, pixel stretch, 404 voids | "Every place has a clean and an anomaly state. The enemies are THD's real autonomous machines – Jenny is Fast Forest's driverless race car." |
| 1:05–1:30 | The rust maze: pick up the chair, one rover fight; Dexter at the coffee machine hands over the pocket computer → **Tab**: the CRT map | "Every image comes from our own campus photos, through one pipeline with one style master – measured against the direction, never guessed." |
| 1:30–1:50 | Jenny's boss fight → she stalls and leaks black fluid → **Dexter absorbs it** and grows | "It plays cozy. It's a secret horror game." |
| 1:50–2:00 | The "to be continued" error dialog | "Built in 24 hours, in the browser, on Vercel. Thank you." |

**Getting there in time:** the live route takes longer than two minutes, so the player starts from coffee-machine saves placed before each beat (the story issues #50–#58 put one before the pond, the bridge and the boss clearing) and skips the walking between them. A beat that isn't playable at 11:00 is shown from the backup recording instead – never from a dev key.

**Backup recording** (the venue Wi-Fi can fail): after the final deploy (≈ 10:30), record the same two minutes from production on the presenting laptop at 1280×720 with sound (Windows: Win + Alt + R). Keep it on the laptop's desktop and in the team Drive folder **WinCS / demo** – video stays out of Git ([08](08-TECH-STACK.md)).

**Offline fallback:** if the URL won't load, run the build locally – `npm --prefix game ci && npm --prefix game run build && npm --prefix game exec vite preview` – and play http://localhost:4173.

**Rehearsal, 11:00:** one timed run with the clock visible; cut lines, not beats, if it runs long. Check before it: production loads, sound is on, the controller (if used) is connected, the recording plays.

## Who does what

Every cell below is a set of issues on the board, assigned to its owner. Vatsal's Codex and Alexander's Claude work in parallel lanes – [13 – Production pipeline](13-PRODUCTION-PIPELINE.md#the-two-lanes) says who touches which folders.

| | Vatsal | Lex | Alexander |
| --- | --- | --- | --- |
| Sprint 2 | Scaffold, Tiled converter, player controller (move, jump, ladders) | Rusty Creek design: the clean bridge, the Jenny ram, the maze as the tutorial; collision in Tiled + encounters | Vercel, export_atlas, hero sheets → atlases, layer split |
| Night | Combat + enemies | Hidden Garden prologue: stretch it to about 3 minutes, less parkour (built on the layout already drawn) + Jenny arena tuning | Prologue sequence, HUD, Dexter, effects |
| Morning | Bugs, feel | Playtest, level polish | Deploy, title, credits |

## Cut order (if we are late, cut from the top)

1. Regions 2–5 (already out of the slice)
2. Glitch meter and its abilities
3. Drone (keep it as scenery that hovers)
4. Jenny phase 3 (the jumping charge)
5. Crab (keep rovers only)
6. Pocket computer *map* (keep the item and the Dexter scene)
7. Prologue walk (start at the pond: Dexter points, then shoves)

**Never cut:** the THD.exe crash transition, the clean → anomaly switch in Rusty Creek, the chair, Dexter absorbing Jenny's black fluid, the deploy.

## Questions for the organisers (ask in person)

AI-generated art and code policy (does it need declaring?) · exact submission format and deadline · is a hosted HTML5 link fine · does the jury need the source.

<!-- nav:start -->
[← 09 – Art pipeline](09-ART-PIPELINE.md) · [Design docs](README.md) · **10 / 14** · [11 – Decisions →](11-DECISIONS.md)
<!-- nav:end -->
