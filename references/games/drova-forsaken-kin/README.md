# Drova – Forsaken Kin

Research date: 21 October 2026. Secondary team reference; Vatsal's Hollow Knight preference remains the lead.

## Evidence and presentation

Just2D's action RPG uses a dark setting drawing on Celtic mythology, with rival factions and restless spirits. [Developer/publisher store listing and trailers](https://store.steampowered.com/app/1585180/). Screenshots are publisher-supplied promotional/gameplay views, not extracted development files. [Visual views](visual-reference.md) and [source manifest](media-sources.json) retain provenance.

Top-down/oblique pixel world, rather than a side-scrolling platformer.

## Design interpretation

The following is our analysis for a tiny prototype, not a claim about the developer's internal architecture.

**Loop:** Exploration, encounters and earned knowledge/abilities make the world increasingly understandable. Faction choices supply social stakes beyond defeating monsters.

**Dependencies:** A convincing faction system needs authored dialogue, consequence state and quests; a large open world needs traversal, encounter placement and many landmarks. Neither follows cheaply from a tileset.

**Worldbuilding:** The useful worldbuilding question is who controls a place and what their rules cost ordinary people. One contradictory sign and one response can suggest a society without implementing multiple factions.

Production pipeline and engine: **unverified in the primary sources checked**. Pixel presentation does not establish the art application, animation workflow, atlas organization or renderer. Do not copy an unsupported engine claim into the technical decision.

## Jam experiment and question

Borrow one environmental detail that hints at a larger culture. Do not borrow the quest count, factions or map scale. Its angled sprites do not solve a side-view player's run/jump frames.

Does Vatsal want to understand a place through exploration, or is combat the real draw? Use Drova only for the former if movement is the chosen focus.

For our own asset organization, group player states, terrain, interaction props and feedback separately, with fixed pivots and explicit frame durations. That is a proposed export contract, not the original game's source folder structure. Before making a whole sheet, test one frame at actual camera scale.

Use the store's official trailers to compare movement, feedback and transitions with the stills. We verified the page/trailer inventory, not a frame-by-frame play session. No commercial sprites, music, source code or maps are licensed for our runtime by this research.
