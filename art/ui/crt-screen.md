# Pocket computer · CRT screen

![Pocket computer · CRT screen](images/crt-screen-preview.png)

**Review:** Not reviewed yet.

## Brief

The first image is the pocket computer case with its screen cut out. Paint ONLY the transparent area, the empty screen inside the bezel: the dark green CRT glass of the screen in the second image but completely EMPTY - very dark green #071E16 base, faint fine horizontal scanlines, a soft lighter green glow toward the centre and darker corners, a faint fine square grid, a slight glass reflection in the top-left corner. No map, no rooms, no lines, no icons, no text. Keep the case exactly as it is.

## Inputs

- Masked edit of [pocket-frame](pocket-frame.md): painted only inside its screen hole (its largest enclosed magenta region); every other pixel is kept
- [hud-preview.png](../direction/images/hud-preview.png), cropped to `482,155,585,390`
- [style-master-preview.png](../direction/images/style-master-preview.png)

Model `gpt-image-2.5-sunburst` · pixel factor 2 · source image `images/crt-screen.png` · rebuild: `python scripts/make_boards.py draw crt-screen --redo --config art/ui/ui.json`
