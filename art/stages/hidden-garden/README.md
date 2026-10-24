# Hidden Garden – stage chunks

The prologue, drawn from the approved [Hidden Garden concept](../../locations/hidden-garden-clean.md) as a flat side elevation: **five chunks, 10 800 px**, about 70 s of walking plus Dexter's waits and two detours ([docs/04 – Hidden Garden, the prologue level](../../../docs/04-WORLD-AND-LEVELS.md#hidden-garden--the-prologue-level), #50). `hg-4-0` is the approved pond chunk (the jetty where Dexter points, the wrong reflection). The four before it were grown leftwards from it with [grow_stage.py](../../../scripts/grow_stage.py) – scenery first, one masked repaint per route feature, the seams between new chunks repainted (docs/09): `hg-0-0` the gate (Dexter's bench, a birch log), `hg-1-0` the hill (an oak on the crest, a hollow behind the grass), `hg-2-0` the terraces (a shed with a ladder to its roof), `hg-3-0` the boardwalk (a gap with stepping stones). Clean only.

**Layers** (#142): each chunk's depth key comes from the model, its masks from the key ([depth_layers.py](../../../scripts/depth_layers.py), [layers.json](layers.json)). Sky, far and mid scroll at 0.1, 0.25 and 0.6 (docs/04) from plates filled where nearer layers hide them; the foreground at 1.2. The pond keeps its exact rules for path, water and foreground; the grown chunks take every band from their key. **Collision**: walk lines traced from each key's play band (`depth_layers.py collision`), spawns, Dexter's waypoints and triggers placed by hand; overlays in [collision/](collision/).

The whole walk: [prologue.png](images/prologue.png) · the parallax at three camera positions: [parallax.png](images/parallax.png) (`python scripts/compare.py parallax art/stages/hidden-garden`).

| | |
| --- | --- |
| [![Hidden Garden · the gate](images/hg-0-0-preview.png)](hg-0-0.md)<br>**[Hidden Garden · the gate](hg-0-0.md)** | [![Hidden Garden · the hill](images/hg-1-0-preview.png)](hg-1-0.md)<br>**[Hidden Garden · the hill](hg-1-0.md)** |
| [![Hidden Garden · the terraces](images/hg-2-0-preview.png)](hg-2-0.md)<br>**[Hidden Garden · the terraces](hg-2-0.md)** | [![Hidden Garden · the boardwalk](images/hg-3-0-preview.png)](hg-3-0.md)<br>**[Hidden Garden · the boardwalk](hg-3-0.md)** |
| [![Hidden Garden · the bench and the pond](images/hg-4-0-preview.png)](hg-4-0.md)<br>**[Hidden Garden · the bench and the pond](hg-4-0.md)** |  |
