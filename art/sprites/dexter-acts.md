# Dexter · gestures

<!-- nav:start -->
[← Dexter · moves](dexter.md) · [Sprite boards](README.md) · **18 / 18** · [Sprite boards →](README.md)
<!-- nav:end -->

![Dexter · gestures](images/dexter-acts-preview.png)

**Review:** ✅ Approved 24 Oct by Alexander (#141). 27 px = 0.35 of the hero as in the approved Dexter stages (docs/04, compare.py lineup); exported to game/public/assets/sprites/ with export_atlas.py. The looping previews below are at twice game size.

## In motion

At twice game size, 12 fps unless the atlas says otherwise: beckon, bow, sweat, proud, creepy, absorb.

![beckon](previews/dexter-acts--beckon.gif) ![bow](previews/dexter-acts--bow.gif) ![sweat](previews/dexter-acts--sweat.gif) ![proud](previews/dexter-acts--proud.gif) ![creepy](previews/dexter-acts--creepy.gif) ![absorb](previews/dexter-acts--absorb.gif)

## Brief

On a flat, solid, pure magenta #FF00FF background (no paper colour, no ground shadows, no dust under the feet), with NO text at all - no titles, no captions, no frame numbers, no labels under the figures: DEXTER, the university's black panther mascot as the small PLUSH toy from the first two images - copy that plush exactly: CHUNKY toy proportions, a BIG round head about 45 % of his whole height, wide rounded ears, big ice-blue eyes, an orange nose, small white fangs, long white whiskers, a short soft body in a light-grey THD crest T-shirt and light-grey shorts, short stubby black arms and legs, big black paw feet with white claw dots, a short curled tail. Black velvet fur with soft dark-grey highlights so the shapes read at small size. A cute, slightly too-alive plush that moves by itself. The second image shows his size: he reaches just above the hero's knee - never slim, never a cat on two legs, never a human body. Strict side view, facing RIGHT, the head turned a little toward the viewer so both eyes show, the same size in every frame. He never talks: everything is body language. 2 rows. Row 1, exactly 6 frames: BECKON, 3 frames (waves one paw toward himself: come here), then BOW, 1 frame (a deep polite bow), then SWEAT, 2 frames (nervous, one big sweat drop on the forehead, ears flat, a small shiver). Row 2, exactly 6 frames: PROUD, 1 frame (chest out, paws on hips), then CREEPY SHADOW, 1 frame (standing still, the face in black shadow with only the ice-blue eyes glowing, slightly too tall), then ABSORB, 4 frames (leans over a small pool of glossy black fluid on the ground, the fluid rises into his paws and body in black strands, it is gone, he stands up a little taller and pleased). Every frame stands on the SAME invisible ground line at the SAME scale. Each row's frames are evenly spaced from left to right with wide clear magenta gaps between neighbours, and rows are separated by empty magenta bands. Draw distinct key poses, never blurred in-betweens. Count the frames: each row has EXACTLY the number stated. No people, no scenery.

## Inputs

- [dexter-stages-preview.png](../direction/images/dexter-stages-preview.png), cropped to `535,585,125,205`
- [dexter-stages-preview.png](../direction/images/dexter-stages-preview.png), cropped to `290,225,390,570`
- `Deggster-9487_1280x1280.jpg` (GameJam_Merch, outside Git)
- `Deggster-9493_1280x1280.jpg` (GameJam_Merch, outside Git)
- `Deggster-9499_1280x1280.jpg` (GameJam_Merch, outside Git)
- [style-master-preview.png](../direction/images/style-master-preview.png)

Model `gpt-image-2.5-sunburst` · pixel factor 2 · source image `images/dexter-acts.png` · rebuild: `python scripts/make_boards.py draw dexter-acts --redo --config art/sprites/boards.json`

<!-- nav:start -->
[← Dexter · moves](dexter.md) · [Sprite boards](README.md) · **18 / 18** · [Sprite boards →](README.md)
<!-- nav:end -->
