# Dexter · moves

<!-- nav:start -->
[← Boss · Jenny, stunned and debris](boss-jenny-2.md) · [Sprite boards](README.md) · **17 / 18** · [Dexter · gestures →](dexter-acts.md)
<!-- nav:end -->

![Dexter · moves](images/dexter-preview.png)

**Review:** 🟡 Drawn 23 Oct, waiting for Alexander's Design review.

## In motion

At twice game size, 12 fps unless the atlas says otherwise: idle, hop, walk, point, shove.

![idle](previews/dexter--idle.gif) ![hop](previews/dexter--hop.gif) ![walk](previews/dexter--walk.gif) ![point](previews/dexter--point.gif) ![shove](previews/dexter--shove.gif)

## Brief

On a flat, solid, pure magenta #FF00FF background (no paper colour, no ground shadows, no dust under the feet), with NO text at all - no titles, no captions, no frame numbers, no labels under the figures: DEXTER, the university's black panther mascot as a 1.5 ft PLUSH toy from the photos: black velvet fur, ice-blue cat eyes, an orange nose, small white fangs, long white whiskers, a light-grey THD T-shirt, black paws. A cute, slightly too-alive plush that moves by itself. Strict side view, facing RIGHT, the same size in every frame. He never talks: everything is body language. 3 rows. Row 1, exactly 7 frames: IDLE, 3 frames (a small breathing bob, the tail flicks), then HOP, 4 frames (crouch, spring up, in the air, land). Row 2, exactly 6 frames: WALK cycle on two legs, a waddling plush walk. Row 3, exactly 7 frames: POINT AT THE GROUND, 3 frames (looks down, raises one paw, points down firmly), then SHOVE, 4 frames (leans back, both paws push forward hard, holds, steps back). Every frame stands on the SAME invisible ground line at the SAME scale. Each row's frames are evenly spaced from left to right with wide clear magenta gaps between neighbours, and rows are separated by empty magenta bands. Draw distinct key poses, never blurred in-betweens. Count the frames: each row has EXACTLY the number stated. No people, no scenery.

## Inputs

- [dexter-stages-preview.png](../direction/images/dexter-stages-preview.png)
- `Deggster-9487_1280x1280.jpg` (GameJam_Merch, outside Git)
- `Deggster-9493_1280x1280.jpg` (GameJam_Merch, outside Git)
- `Deggster-9499_1280x1280.jpg` (GameJam_Merch, outside Git)
- `Deggster-9497_1280x1280.jpg` (GameJam_Merch, outside Git)
- `thd-sticker-deggster_1280x1280.png` (GameJam_Merch, outside Git)
- [style-master-preview.png](../direction/images/style-master-preview.png)

Model `gpt-image-2.5-sunburst` · pixel factor 2 · source image `images/dexter.png` · rebuild: `python scripts/make_boards.py draw dexter --redo --config art/sprites/boards.json`

<!-- nav:start -->
[← Boss · Jenny, stunned and debris](boss-jenny-2.md) · [Sprite boards](README.md) · **17 / 18** · [Dexter · gestures →](dexter-acts.md)
<!-- nav:end -->
