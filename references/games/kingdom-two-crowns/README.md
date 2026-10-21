# Kingdom Two Crowns

Research date: 21 October 2026. Secondary team reference; Vatsal's Hollow Knight preference remains the lead.

## Evidence and presentation

Fury Studios/Coatsink and Raw Fury describe a side-view micro-strategy game about coins, defenses, exploration and protecting a crown from nighttime Greed, playable solo or cooperatively. [Developer/publisher store listing and trailers](https://store.steampowered.com/app/701160/). Screenshots are publisher-supplied promotional/gameplay views, not extracted development files. [Visual views](visual-reference.md) and [source manifest](media-sources.json) retain provenance.

One horizontal ground strip with pixel scenery and layered depth.

## Design interpretation

The following is our analysis for a tiny prototype, not a claim about the developer's internal architecture.

**Loop:** Travel to discover needs, spend resources on people and structures, then see whether those investments survive the night. The player's small action set produces indirect consequences.

**Dependencies:** Coin income, costs, recruitment, construction, enemy waves and failure recovery are tightly coupled. Implementing only spending without an economy creates empty interactions; adding waves requires tuning pacing and recovery.

**Worldbuilding:** Repeated landmarks and the contrast between daylight work and nighttime threat provide a readable rhythm. Suggest scale with distant architecture and silhouettes rather than a vast navigable map.

Production pipeline and engine: **unverified in the primary sources checked**. Pixel presentation does not establish the art application, animation workflow, atlas organization or renderer. Do not copy an unsupported engine claim into the technical decision.

## Jam experiment and question

Borrow the clarity of a single interaction and a recognizable route. A three-room traversal game should not also gain a defense economy. Reflections and atmospheric lighting are optional polish.

Is the appeal calm movement through a layered landscape, or making investments under pressure? Those lead to different prototypes.

For our own asset organization, group player states, terrain, interaction props and feedback separately, with fixed pivots and explicit frame durations. That is a proposed export contract, not the original game's source folder structure. Before making a whole sheet, test one frame at actual camera scale.

Use the store's official trailers to compare movement, feedback and transitions with the stills. We verified the page/trailer inventory, not a frame-by-frame play session. No commercial sprites, music, source code or maps are licensed for our runtime by this research.
