# 10 – Jam plan

<!-- nav:start -->
[← 09 – Art pipeline](09-ART-PIPELINE.md) · [Design docs](README.md) · **10 / 13** · [11 – Decisions →](11-DECISIONS.md)
<!-- nav:end -->

**DEGDEV 3**, Deggendorf: Fri 23 Oct 14:00 → Sat 24 Oct 13:30. Jury voting starts at **11:30 Saturday**, and that is our hard stop. Event facts: [research/degdev-3.md](research/degdev-3.md).

## Timeline

| When (Fri → Sat) | Goal | Done when |
| --- | --- | --- |
| Fri 15:30–18:40 (Sprint 1) | References, recordings, design docs, visual direction, stage concepts, repo clean | This folder, reviewed by the team ✅ |
| **18:40–19:30** | **Issue board**: milestones (M0 setup → M1 movement → M2 combat → M3 prologue → M4 Rusty Creek + Jenny → M5 polish + submit), epics with sub-issue stories, every story with acceptance criteria; the reusable pipelines (chunks left/right/up/down, transition chunks, layer split, collision annotation) as their own epic | Board live, everyone has a first issue |
| 19:30–20:00 | Pizza. Walk the board together; lock the title | Decisions logged |
| 20:00–00:00 (Sprint 2) | `game/` scaffold on Vercel · player controller (walk, run, jump, slopes, ledge grab, ladders) on Rusty Creek collision · sprite boards from the approved direction | Hero moves on the real stage, on a preview URL |
| 00:30–03:00 | Chair combat (3 attacks + guard) · rover + crab AI · health/death/respawn · coffee machine save · clean → anomaly switch | You can fight through chunk 1 |
| 03:00–07:00 | Prologue (Hidden Garden walk, Dexter, pond, THD.exe crash) · Jenny boss · drone · pickups · HUD | Full slice playable start to finish |
| 07:00–08:00 | Breakfast. **Playtest by someone outside the team** | Bug list |
| 08:00–11:00 | Fix · sound · juice (hit-stop, shake, falling leaves, foreground blur) · title + credits · final deploy | Production URL stable |
| 11:00–11:30 | Freeze. Submit. Rehearse the 2-minute demo | – |

## Who does what

| | Vatsal | Lex | Alexander |
| --- | --- | --- | --- |
| Sprint 2 | Player controller (move, jump, ladders) | Rusty Creek collision annotation + encounter placement | Scaffold, Vercel, sprite pipeline → atlases |
| Night | Combat + enemies | Prologue map (Hidden Garden) + Jenny arena tuning | Prologue sequence, HUD, Dexter, effects |
| Morning | Bugs, feel | Playtest, level polish | Deploy, title, credits |

## Cut order (if we are late, cut from the top)

1. Regions 2–5 (already out of the slice)
2. Glitch meter and its abilities
3. Drone (keep it as scenery that hovers)
4. Jenny phase 3 (the jumping charge)
5. Crab (keep rovers only)
6. Pocket computer *map* (keep the item and the Dexter scene)
7. Prologue walk (start at the pond with a single interact)

**Never cut:** the THD.exe crash transition, the clean → anomaly switch in Rusty Creek, the chair, Dexter absorbing Jenny's black fluid, the deploy.

## Questions for the organisers (ask in person)

AI-generated art and code policy (does it need declaring?) · exact submission format and deadline · is a hosted HTML5 link fine · does the jury need the source.

<!-- nav:start -->
[← 09 – Art pipeline](09-ART-PIPELINE.md) · [Design docs](README.md) · **10 / 13** · [11 – Decisions →](11-DECISIONS.md)
<!-- nav:end -->
