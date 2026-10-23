# 08 – Tech stack and where things live

<!-- nav:start -->
[← 07 – Asset manifest](07-ASSET-MANIFEST.md) · [Design docs](README.md) · **8 / 13** · [09 – Art pipeline →](09-ART-PIPELINE.md)
<!-- nav:end -->

## The stack

| Layer | Choice | Why |
| --- | --- | --- |
| Engine | **Phaser 3** (3.90) | Mature 2D web engine: sprites, atlases, input (keyboard, gamepad, touch), audio, cameras with parallax scroll factors, scenes. Many examples, small learning curve for the team |
| Language | **TypeScript** | Catches mistakes while several people edit fast; same language for game code and tooling |
| Build | **Vite** | Instant dev server, hot reload, one static `dist/` folder |
| Collision | **Our own small kinematic controller** against authored data (polylines for ground and slopes, boxes for walls, ladders and triggers) | Arcade physics can't do slopes and Matter is fiddly for a platformer feel. A ground polyline plus raycasts is about 200 lines and does exactly the hills we want |
| Hosting | **Vercel** | Like Voyager: every PR gets a preview URL, `main` is production. Static site, no server |
| Art tooling | **Python 3.13 + Pillow** scripts in `scripts/` | Rerunnable generation, crushing, layering, slicing, verification |
| Image generation | OpenAI **gpt-image-2.5-sunburst** (edit endpoint with real photo references) | It followed layout briefs far better than the "flare" variant in a side-by-side test (23 Oct). Never generate from text alone |
| Transcription | OpenAI **gpt-4o-transcribe-diarize** | Speaker-labelled meeting transcripts |

**Rendering:** a 1280×720 canvas with `pixelArt: true` (nearest-neighbour filtering, `roundPixels`). The canvas scales to fit the window in integer steps where possible. Stage chunks are 2160×720 PNG plates, 7 layers each, with scroll factors from 0.2 (sky) to 1.15 (foreground foliage).

## Repository layout

```
WinCS/
├─ README.md              start here
├─ AGENTS.md              rules for AI agents (Codex, Claude, …)
├─ CONTRIBUTING.md        branches, PRs, commits
├─ docs/                  the design – numbered, read in order
│  ├─ 01…12-*.md
│  ├─ meetings/           13 recordings: transcripts + summaries
│  └─ research/           event facts, engine notes, what we love
├─ art/                   OUR art – sources, configs, approved outputs
│  ├─ direction/          the visual-direction pack (style master + 12 images)
│  ├─ sprites/            sprite boards (hero, enemies, items, …)
│  └─ stages/<region>/    7-layer stage plates, route, collision
├─ references/            OTHER people's work and our photo collages – never shipped
│  ├─ campus/             location collages from our photos
│  ├─ games/              18 reference games
│  └─ animation/          trailer frames
├─ game/                  the Phaser project (added when the build starts)
│  ├─ src/
│  └─ public/assets/      exported atlases + plates the game loads
├─ scripts/               every generator, checker and exporter
└─ tmp/                   ignored: raw API drawings, audio chunks, work files
```

## Where things are stored – the rules

| What | Where | In Git? |
| --- | --- | --- |
| Design docs, configs, prompts | `docs/`, `art/**/*.json` | ✅ |
| Approved art (crushed PNGs, previews, stage plates) | `art/` | ✅ |
| Game code and exported game assets | `game/` | ✅ |
| **Source photos** (126 campus photos), **audio recordings**, merch photos | Team Google Drive folder **WinCS / sources**, mirrored locally in `~/Downloads/…` (`WINCS_PHOTOS`) | ❌ never |
| Raw API drawings, audio chunks, raw API JSON | `tmp/` | ❌ (ignored) |
| Keys (`OPENAI_API_KEY`, `GITHUB_PAT`) | `.env` (ignored), Vercel env if ever needed at runtime (it isn't) | ❌ never |
| Builds | Vercel | ❌ (`dist/` ignored) |

**Why photos stay out:** they show people, and they are big. Every config lists them by file name, and the scripts read them from `WINCS_PHOTOS`, so a teammate with the Drive folder can rerun everything.

## Deploying to Vercel

1. `game/` gets `vercel.json`: build `npm run build`, output `dist`.
2. Connect THD-AI/WinCS in Vercel (**Root Directory:** `game`). Private org repos need a Vercel team with access to the THD-AI org. If that's not available in time, deploy from a laptop with `vercel --prod` (the CLI uploads the build directly).
3. Every PR gets a preview URL; `main` is the jam submission URL.

## Commands

```bash
# art
python scripts/make_boards.py draw --config art/direction/direction.json   # direction pack
python scripts/make_boards.py draw                                         # sprite boards
python scripts/make_boards.py crush                                        # rebuild committed images offline
python scripts/creek_layers.py --build                                     # rebuild Rusty Creek plates + previews
python scripts/creek_layers.py                                             # verify them
python scripts/navigation.py                                               # refresh Previous/Next links
python scripts/check_docs.py                                               # links, images, no HTML, no duplicates

# meetings
python scripts/transcribe_recordings.py "<audio file>" --id A14

# game (once game/ exists)
cd game && npm install && npm run dev
```

<!-- nav:start -->
[← 07 – Asset manifest](07-ASSET-MANIFEST.md) · [Design docs](README.md) · **8 / 13** · [09 – Art pipeline →](09-ART-PIPELINE.md)
<!-- nav:end -->
