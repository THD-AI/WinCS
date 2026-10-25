# The student · death

<!-- nav:start -->
[← The student · hurt and interact](hero-hurt.md) · [Sprite boards](README.md) · **6 / 31** · [The student · jump, fall, climb →](hero-air.md)
<!-- nav:end -->

![The student · death](images/hero-death-preview.png)

**Review:** ✅ Approved 23 Oct by Alexander. Counts match docs/07; exported to game/public/assets/sprites/ with export_atlas.py. The looping previews below are at twice game size.

## In motion

At twice game size, 12 fps unless the atlas says otherwise: death, death.

![death](previews/hero-death--death.gif) ![death](previews/hero-death--death.gif)

## Brief

On a flat, solid, pure magenta #FF00FF background (no paper colour, no ground shadows, no dust under the feet), with NO text at all - no titles, no captions, no frame numbers, no labels under the figures: Hero from the first image (keep the THD poncho, the shadow-filled hood and all proportions exactly), facing right, strict side view, identical scale in every frame. 2 rows that form ONE death animation of 12 frames, read left to right, row 1 then row 2. Row 1, exactly 6 figures: hit stagger, knees buckle, collapse onto both knees, slump forward, hands catch the ground, fall flat forward. Row 2, exactly 6 figures: lying still face-down with the poncho spread out, the hood dark and empty, a last twitch, then the whole figure breaks into square pixel dust in three steps until only a few drifting pixels are left. It is final and quiet, never gory: no blood. The THD crest patch is on the poncho's BACK only and is never visible from the side. Every figure stands on the SAME invisible ground line, even airborne poses: the game moves the body, so never draw a figure higher up. Each row's figures are evenly spaced from left to right with wide clear magenta gaps between neighbours: no tassel, foot, hand or poncho edge touches the next figure, and rows are separated by empty magenta bands. Draw distinct key poses, never blurred in-betweens; neighbouring frames change by small continuous steps so they loop smoothly. Count the figures: each row has EXACTLY the number stated.

## Inputs

- [hero-preview.png](images/hero-preview.png)
- [style-master-preview.png](../direction/images/style-master-preview.png)

Model `gpt-image-2.5-sunburst` · pixel factor 2 · source image `images/hero-death.png` · rebuild: `python scripts/make_boards.py draw hero-death --redo --config art/sprites/boards.json`

<!-- nav:start -->
[← The student · hurt and interact](hero-hurt.md) · [Sprite boards](README.md) · **6 / 31** · [The student · jump, fall, climb →](hero-air.md)
<!-- nav:end -->
