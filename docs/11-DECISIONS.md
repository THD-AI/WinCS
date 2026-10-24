# 11 – Decisions

<!-- nav:start -->
[← 10 – Jam plan](10-JAM-PLAN.md) · [Design docs](README.md) · **11 / 14** · [12 – Team workflow →](12-TEAM-WORKFLOW.md)
<!-- nav:end -->

One line per decision: what was decided, who decided it, and when. An **open** item needs the team. Older decision history (D001–D036) is in Git history; this log restarts from the consolidated design on 23 Oct.

| # | Decision | Status | Who · when |
| --- | --- | --- | --- |
| 1 | 2D side-scrolling exploration-action, pixel art, "funny but deep" | ✅ | Vatsal · 21 Oct |
| 2 | Tone: familiar campus → uncanny → psychological horror. No gore, no apocalypse | ✅ | Team meeting (A11) · 23 Oct |
| 3 | Premise: quantum-computing field experiment opens dimensions; anomalies possess machines | ✅ | Team meeting (A11) · 23 Oct |
| 4 | Build one character and one level first (Prologue + Rusty Creek), then measure | ✅ | Team meeting (A11) · 23 Oct |
| 5 | Controls: four directions + two buttons; map only after you find the pocket computer; no minimap. Lex's variant (↑ = jump, buttons = attack + skill) is open | ✅ · 🟡 variant | Alexander (A11); Lex (A14) · 23 Oct |
| 6 | Hero: 6 ft THD student, grey/blue/teal THD poncho, face never seen, gender irrelevant | ✅ | Alexander · 23 Oct |
| 7 | Dexter = the Deggster panther plush (1.5 ft) → final form 8.5 ft; absorbs anomalies; secret boss | ✅ | Alexander + Lex (A12) · 23 Oct |
| 8 | Look: hi-bit pixel art like our stage plates; Planet of Lana scale (hero ≈ 1/8 screen); 7-layer stages | ✅ | Alexander · 23 Oct |
| 9 | Weapons in order: chair (Region 1) → tray, a returning throw (Region 2) → sign pole | ✅ | Alexander (A12) · 23 Oct |
| 10 | Region transitions via anomalies (pond, obelisk, goo, slide); one shared crash-spin animation | ✅ | Alexander (A09, A13) + Lex's slide (A12) · 23 Oct |
| 11 | Dexter presence: **appears** at save points and region starts, never follows (Alexander) **and** the 3-charge glitch meter (Lex), merged: charges open anomaly interactions and puzzles – no spells – and Dexter takes what's left | ✅ | Team review (A14) · 23 Oct |
| 12 | Stack: Phaser 3 + TypeScript + Vite, Vercel, custom slope controller | 🟡 proposed | Alexander · team to confirm |
| 13 | Working title **DEGGSTER.EXE** is a placeholder: needs more work, less obvious, a bit ironic. *Deggendorf Simulator* added | 🟡 open | Team review (A14); alternates in [01](01-PROPOSAL.md) |
| 14 | Source photos and audio stay out of Git (Drive); only approved art is committed | ✅ | Alexander · 22 Oct |
| 15 | No HTML viewers; Markdown pages with Previous / Next only | ✅ | Alexander · 23 Oct |
| 16 | Visual-direction pack approved before any sprite boards are drawn | ✅ | Alexander · 23 Oct |
| 17 | Boss of Region 1: **Jenny**, the possessed Fast Forest race car (charge → crash → debris → stunned) | ✅ | Alexander · 23 Oct |
| 18 | Issues and project board are created after this design is reviewed | ✅ done | Alexander · 23 Oct |
| 19 | AI-generated art: allowed? needs declaring? | ❓ ask organisers | – |
| 20 | A **secret horror** game: cozy first, wrong on a second look | ✅ | Alexander · 23 Oct |
| 21 | Dexter's final form is THD's Deggster **mascot costume**, 8.5 ft, leaking black fluid where the costume pieces join (Duck Season) – not a goo monster | ✅ | Alexander · 23 Oct |
| 22 | Enemies are THD's real **autonomous** machines (rover, crab hexapod, drone, Fast Forest's driverless Jenny); the anomaly takes over their autonomy | ✅ | Alexander · 23 Oct |
| 23 | Locations are side-scrolling stages built from the campus collages; wide "wallpaper" strips are rejected | ✅ revised | Alexander · 23 Oct |
| 24 | Every region has a **clean** and an **anomaly** state; touching the region's own anomaly turns it and pushes you back to its start. In Rusty Creek, **Jenny ramming you on the bridge** is the trigger (bridge → rust maze) | ✅ | Alexander · 23 Oct (trigger: A14) |
| 25 | Region crossing is cheap: damage sprite → "THD.exe has stopped responding." window → land in the new place, finish the damage sprite | ✅ | Alexander · 23 Oct |
| 26 | Exploration in four directions: chunk grid (left, right, up, down), transition chunks (e.g. underground), slopes to slide. Ledge pull-up **cut** (a later update at most) | ✅ | Alexander · 23 Oct (cut: A14) |
| 27 | **Glide** (poncho as a sail) – the Region 2 upgrade, after the jam slice | ✅ | Lex, Alexander · 23 Oct |
| 28 | Layer stack with foreground blur, reflections, falling leaves; every chunk gets a collision annotation (walk, slide, one-way, ledge, climb, solid, no-go, hazard, interactable, spawn, glide lift) | ✅ | Alexander · 23 Oct |
| 29 | First boss: **Jenny**; other bosses discussed later | ✅ | Alexander · 23 Oct |
| 30 | The jam slice is **Hidden Garden prologue (~3 min, less parkour) → Rusty Creek → Jenny**. Later regions get visual direction only | ✅ | Team review (A14) · 23 Oct |
| 31 | Dexter shoves or trips you into the pond: no cutscene, no dialogue, **no thought bubbles**. Nobody speaks in the game | ✅ | Alexander, Vatsal (A14) · 23 Oct |
| 32 | The Rusty Creek maze is the movement tutorial (jump, climb, ladders, chair, first rover) | ✅ | Alexander (A14) · 23 Oct |
| 33 | No stamina bar; you glide as long as you're airborne | ✅ | Team review (A14) · 23 Oct |
| 34 | Food heals a set amount, with small extras (Leberkäse: defence; drinks: boosts); Dexter leaves it on your path. Numbers are tuned in playtests | ✅ · 🟡 numbers | Team review (A14) · 23 Oct |
| 35 | The chair is a light weapon: alternating swings, slight recoil, no ground crack | ✅ | Team review (A14) · 23 Oct |
| 36 | Jenny is a shielded enemy: hit her from behind or while stunned; she throws scrap | ✅ | Lex (A14) · 23 Oct |
| 37 | Asset frame lists revised: run start, idle↔walk↔run bridges, 3 idle variants, jump +2, ladder 4, hit and death doubled; enemies, food, HUD and the crash window approved | ✅ | Team review (A14) · 23 Oct |
| 38 | Parked for later: Dexter possessing you (secret ending), the underground server-farm lab, the "they use you" theme, a VW boss | 🅿️ later | Team review (A14) · 23 Oct |
| 39 | Board, labels, issue forms and PR automation follow THD Room Finder: one epic per milestone, `[M1-S3]` stories as sub-issues, one PR per story, native *blocked by*, Status/Priority/Size/Design review fields, stacked PRs with merge commits | ✅ | Alexander · 23 Oct |
| 40 | Two agent lanes: Alexander + Claude (OpenAI API) make every image and the integration; Vatsal + Codex write the game systems against fixed hand-over formats, with placeholders. Only lane A generates art. Lex draws collision in Tiled ([13](13-PRODUCTION-PIPELINE.md)) | ✅ | Alexander · 23 Oct |
| 41 | Sizes and proportions follow the approved art in `art/`: where an approved direction image disagrees with a size computed from feet, it is measured there and the art wins (Dexter's plush 27 px, not 20) | ✅ | Alexander · 24 Oct |
| 42 | **One owner, no lanes** (replaces 40's split): Codex has stopped (no credits), so Alexander + Claude own the whole game – art, systems, story, deploy. Codex's stack (#111 → #149) is the base and is reworked on top where it misses the art (feel, timing, hardcoded values – [#156](https://github.com/THD-AI/WinCS/issues/156), merge plan [#161](https://github.com/THD-AI/WinCS/issues/161)) | ✅ | Alexander · 24 Oct |
| 43 | **Mechanics stem from the art.** `art/` (direction, locations, stages, sprites) is the source; the numbers in the docs are starting points to refine, not fixed. The current Rusty Creek stage was the map-generation prototype and is outdated: Region 1 is rebuilt from the direction with the Hidden Garden's method ([#157](https://github.com/THD-AI/WinCS/issues/157)). Missing or unreadable art is drawn with gpt-image-2.5-sunburst through one asset system ([#158](https://github.com/THD-AI/WinCS/issues/158), [#159](https://github.com/THD-AI/WinCS/issues/159)) | ✅ | Alexander · 24 Oct |

<!-- nav:start -->
[← 10 – Jam plan](10-JAM-PLAN.md) · [Design docs](README.md) · **11 / 14** · [12 – Team workflow →](12-TEAM-WORKFLOW.md)
<!-- nav:end -->
