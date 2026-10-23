# HUD · glitch meter and boss bar

![HUD · glitch meter and boss bar](images/hud-meters-preview.png)

**Review:** Not reviewed yet.

## Brief

Solid flat pure magenta #FF00FF background everywhere. Row 1: the glitch meter orb from the second row of the first image, each about 120 px across: a round dark metal socket with a glowing cyan core and torn, broken pixel edges around the glow. Four orbs: EMPTY (dark socket, no glow), then three frames of the CHARGED orb glowing, the glow pulsing and the torn pixel bits shifting a little each frame (a looping shimmer). Row 2, below with a wide gap: the boss health bar, as three separate pieces: a long thin EMPTY BAR FRAME (dark rusted metal with rivets at both ends, about 1100 px long and 50 px tall, hollow inside), a short FILL piece (a straight glowing red-orange bar segment that can repeat, same inner height as the frame), and a small ICON of a race car seen head-on with glowing headlights (the boss Jenny), about 80 px.

## Inputs

- [hud-preview.png](../direction/images/hud-preview.png), cropped to `40,45,300,135`
- [style-master-preview.png](../direction/images/style-master-preview.png)

Model `gpt-image-2.5-sunburst` · pixel factor 2 · source image `images/hud-meters.png` · rebuild: `python scripts/make_boards.py draw hud-meters --redo --config art/ui/ui.json`
