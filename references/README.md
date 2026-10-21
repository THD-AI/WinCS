# Reference library

Research collected 21 October 2026. All **13 named games** have dedicated analysis and visual-reference files. Screenshots/GIFs are developer/publisher promotional material with original URLs and credits. They are private design references, not production assets. Exact internal sprite sheets, source projects and map files were not obtained.

## Start with Vatsal

| Game | Why it is here | Analysis | Views |
| --- | --- | --- | --- |
| Hollow Knight | Vatsal's main reference: exploration, movement, atmosphere; original art is hand-drawn | [Read](games/hollow-knight/README.md) | [Images](games/hollow-knight/visual-reference.md) |
| 9 Years of Shadows | Lex's side-view pixel comparison | [Read](games/9-years-of-shadows/README.md) | [Images](games/9-years-of-shadows/visual-reference.md) |
| Metroid Dread | Lex's tutorial-size/genre comparison, not a content blueprint | [Read](games/metroid-dread/README.md) | [Images](games/metroid-dread/visual-reference.md) |
| Apple Knight | Alexander's differentiation question | [Read](games/apple-knight/README.md) | [Images](games/apple-knight/visual-reference.md) |
| Animal Well | Alexander's exploration/puzzle comparison | [Read](games/animal-well/README.md) | [Images](games/animal-well/visual-reference.md) |
| Soul Knight | Lex's preference: readable combat and absurdity | [Read](games/soul-knight/README.md) | [Images](games/soul-knight/visual-reference.md) |

## Secondary team references

| Game | Useful lens | Analysis | Views |
| --- | --- | --- | --- |
| Drova – Forsaken Kin | Environmental society, world coherence; top-down | [Read](games/drova-forsaken-kin/README.md) | [Images](games/drova-forsaken-kin/visual-reference.md) |
| Kingdom Two Crowns | Minimal input, layered horizontal space, indirect action | [Read](games/kingdom-two-crowns/README.md) | [Images](games/kingdom-two-crowns/visual-reference.md) |
| Kingdom Eighties | Place, restrained lighting, everyday props | [Read](games/kingdom-eighties/README.md) | [Images](games/kingdom-eighties/visual-reference.md) |
| Stardew Valley | Small acts, readable objects and visible improvement | [Read](games/stardew-valley/README.md) | [Images](games/stardew-valley/visual-reference.md) |
| Children of Morta | Homecoming and emotional context around action | [Read](games/children-of-morta/README.md) | [Images](games/children-of-morta/visual-reference.md) |
| Planet of Lana | Composition, scale and visual storytelling; painterly rather than pixel | [Read](games/planet-of-lana/README.md) | [Images](games/planet-of-lana/visual-reference.md) |
| Dead Cells | Combat readability and documented animation production tradeoffs | [Read](games/dead-cells/README.md) | [Images](games/dead-cells/visual-reference.md) |

See [comparison and dependencies](comparison.md). The [team brief](../docs/brief/team-and-intent.md) separately records Voyager and the film couch as context. They are not candidate-game requirements.

## How to use the library

1. Vatsal picks two gameplay moments, not entire games. State the exact quality: a jump, a loop back, a reveal, a silhouette, an interaction.
2. Compare three views: navigation/camera scale, encounter/obstacle readability, and world mood/landmark. Some supplied stills show UI or co-op; captions identify those rather than pretending they are other camera angles.
3. Watch official gameplay/trailers for motion; a screenshot cannot establish input latency or frame timing. We checked source pages and image content, not every full playthrough. Video playback limitations are recorded per game.
4. Translate one quality into an original, bounded mechanic, with dependencies and asset cost. Remove one expensive feature for every new system proposed.

## Provenance and limits

Stored files have source URLs, credits and hashes in visual-reference.md or media-sources.json. Original aspect ratios and store compression are retained. No source-game sprites were extracted. Promotional screenshots may contain compositing/UI and do not establish original layer hierarchy or engine internals. Unknown engines remain unknown; strongest engine/pipeline evidence is linked where available (Hollow Knight, Animal Well, Dead Cells).

Before any public repository/export, review whether to keep media as links instead of redistributing reference images. A future game build must not include references/.
