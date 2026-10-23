# Hidden Garden – stage chunks

The prologue, drawn from the approved [Hidden Garden concept](../../locations/hidden-garden-clean.md) as a flat side elevation with its figures removed. One chunk, `hg-0-0` (2160×720): the bench where Dexter sits at the start (x ≈ 190–320), the stone path and the timber jetty (path top y = 441), the end of the jetty where Dexter points (x ≈ 1290–1323), and one wrong patch in the pond's reflection below it – a rusty girder with a ladder that isn't there. Clean only.

**Layers** (#142): the model repainted the chunk as a flat-colour depth key, and the masks come from it ([depth_layers.py](../../../scripts/depth_layers.py), [layers.json](layers.json)). Sky, far and mid scroll slower than the path (0.1, 0.25, 0.6, docs/04), and their plates are filled where the nearer layers hide them, so nothing tears open when the camera moves. The foreground scrolls at 1.2. [00 sky](layers/hg-0-0.00-sky.filled.png) · [01 far](layers/hg-0-0.01-far.filled.png) · [02 mid](layers/hg-0-0.02-mid.filled.png) · [03 rear](layers/hg-0-0.03-rear.png) · [04 water](layers/hg-0-0.04-water.png) · [05 play](layers/hg-0-0.05-play.png) · [07 foreground](layers/hg-0-0.07-foreground.png). The parallax at three camera positions: [parallax.png](images/hg-0-0-parallax.png) (`python scripts/compare.py parallax art/stages/hidden-garden`).

| | |
| --- | --- |
| [![Hidden Garden · the bench and the pond](images/hg-0-0-preview.png)](hg-0-0.md)<br>**[Hidden Garden · the bench and the pond](hg-0-0.md)** |  |
