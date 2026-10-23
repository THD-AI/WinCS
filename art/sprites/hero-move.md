# The student · walk

<!-- nav:start -->
[← The student · hero design](hero.md) · [Sprite boards](README.md) · **2 / 10** · [The student · idle variants →](hero-idle.md)
<!-- nav:end -->

![The student · walk](images/hero-move-preview.png)

**Review:** ✅ Approved 23 Oct by Alexander. Counts match docs/07; exported to game/public/assets/sprites/ with export_atlas.py. The looping previews below are at twice game size.

## In motion

At twice game size, 12 fps unless the atlas says otherwise: idle, idle-walk, walk.

![idle](previews/hero-move--idle.gif) ![idle-walk](previews/hero-move--idle-walk.gif) ![walk](previews/hero-move--walk.gif)

## Brief

On a flat, solid, pure magenta #FF00FF background (no paper colour, no ground shadows, no dust under the feet), with NO text at all - no titles, no captions, no frame numbers, no labels under the figures: Hero from the first image (keep the THD poncho, the shadow-filled hood and all proportions exactly), facing right, strict side view, identical scale in every frame. 2 rows. Row 1, exactly 8 figures: IDLE breathing loop, 6 frames (relaxed stance, the poncho rises and settles, tassels sway a little), then IDLE TO WALK, 2 frames (weight shifts forward, the front foot lifts). Row 2, exactly 8 figures: WALK cycle in key poses with clearly different leg positions - contact (legs wide apart, heel down), down, passing (legs together), up, for the right leg, then the same four for the left leg; the poncho hem swings against the legs, the backpack bobs. The THD crest patch is on the poncho's BACK only and is never visible from the side. Every figure stands on the SAME invisible ground line, even airborne poses: the game moves the body, so never draw a figure higher up. Each row's figures are evenly spaced from left to right with wide clear magenta gaps between neighbours: no tassel, foot, hand or poncho edge touches the next figure, and rows are separated by empty magenta bands. Draw distinct key poses, never blurred in-betweens; neighbouring frames change by small continuous steps so they loop smoothly. Count the figures: each row has EXACTLY the number stated.

## Inputs

- [hero-preview.png](images/hero-preview.png)
- [style-master-preview.png](../direction/images/style-master-preview.png)

Model `gpt-image-2.5-sunburst` · pixel factor 2 · source image `images/hero-move.png` · rebuild: `python scripts/make_boards.py draw hero-move --redo --config art/sprites/boards.json`

<!-- nav:start -->
[← The student · hero design](hero.md) · [Sprite boards](README.md) · **2 / 10** · [The student · idle variants →](hero-idle.md)
<!-- nav:end -->
