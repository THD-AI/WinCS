# Playtest checklist – 24 Oct (A15–A17)

<!-- nav:start -->
<!-- nav:end -->

Vatsal and Lex played the live slice on 24 Oct and recorded what to fix ([A15](transcripts/A15.md), 10 min; Lex's voice notes [A16](transcripts/A16.md) and [A17](transcripts/A17.md)); Lex added two jam requirements in the team chat; Alexander asked for a menu and a debug mode the same morning. Transcribed with the OpenAI API (`gpt-4o-transcribe-diarize`); audio stays out of Git. Status as of 10:15, before the 11:00 freeze.

**Legend:** ✅ done on a branch (PR) · 🔧 in progress · ❓ needs Alexander's decision · ⏭ after the jury

## Readability

| # | What they said | Interpretation | Status |
| --- | --- | --- | --- |
| R1 | The hero blends into the background (trees, tree line, buildings); try a white poncho or a purple "Teletubby" sweater – "something for Alex to decide" | The grey/blue/teal THD poncho sits in the same values as the autumn scenery | ❓ colour; a brighter rim or outline is the quick fix |
| R2 | Enemies are "way too small", barely visible; the professor didn't realise the robots were enemies. Vatsal: robots +300 % (≈ half the hero), hero ×1.5. Lex: "maybe don't make them bigger, but make them actually visible" | Rovers are 25 px against an 80 px hero. Scale against the world is the open question (Alexander: "is the character too small?") | ❓ bigger vs more visible – see the scale note below |
| R3 | The attack animation is confusing, "barely noticeable that it is an attack" | Swing and hit need a visible arc, flash and impact | 🔧 fights branch |
| R4 | The foreground bar or pipe in the middle of the view clutters it: move it behind (in front of the tree line, behind the buildings) | Rusty Creek's near-rails plate (z 6, scroll 1.1) crosses the play area | ⏭ a layer move; check with the Debug tab's layer switches |

## Jenny – the boss fight

| # | What they said | Status |
| --- | --- | --- |
| J1 | The fight only starts when you approach her from the front, at one spot; then she crashes into you at once and there is nothing you can do | 🔧 force the start from either side, a fair moment at the start, no guaranteed damage |
| J2 | "Whenever the player receives damage it needs to be the player's mistake" | ✅ only her charging front half hurts now (fights branch); 🔧 the start |
| J3 | One Jenny hit leaves you nearly dead (3 of 5) → at most half the health | 🔧 |
| J4 | Make it obvious she must crash into something to become hittable – the satisfaction of figuring it out | ✅ crash shake, sound and smoke; stun-ending warning; reboot sparks (fights branch) |
| J5 | Scraps should hurt but must be clearly visible | 🔧 |
| J6 | An invisible wall in the arena; the arena is "awful to fight in" with limited movement – add platforms in the middle, maybe a slightly higher jump to clear her | ✅ two girder platforms over her floor (`art/stages/rusty-creek/arena/`, an overlay layer): reachable with a full jump, and she drives under them – stand on one and let her pass; the walls are drawn whenever they are closed (#186) |
| J7 | After Jenny: a wall at the right end that says "you can't pass until you beat her", not just the camera stopping | ✅ both walls are drawn as rusted hazard-striped barriers whenever they are closed, and the fight (and the walls) start as soon as you are inside the arena (#186); they fade out when she is beaten |
| J8 | Landing on top of an enemy hurts the hero | Intended – no change |
| J9 | Double jump | Rejected (Lex: Metroidvanias give it last or never) |

## Mobs, hitboxes, movement

| # | What they said | Status |
| --- | --- | --- |
| M1 | Some hitboxes don't work: a robot walking on top of something wrong, a drone over the water whose hitbox makes no sense | 🔧 – the debug overlay draws every hitbox, sight box and patrol to find them |
| M2 | Ladder: alternate the arms by flipping the climb sprite each rung (no new art) | 🔧 |
| M3 | WASD did not move the hero (A16) | 🔧 the code reads A/D/W/S – checking keyboard layouts |
| M4 | Attack only on J is awkward for arrow-key players: add a second bind (Z/X), or move it | 🔧 second bind X |
| M5 | Rebindable keys in Settings (nice to have) | ✅ Settings → Keys: one key of your own per action, saved in the browser; the Controls tab lists your keys |

## Menu and debug (A17 and Alexander)

| # | What | Status |
| --- | --- | --- |
| U1 | Esc opened nothing; the pause menu must at least go back to the main menu (volume optional) | ✅ [#181](https://github.com/THD-AI/WinCS/pull/181): Esc / Start / ☰ menu with Controls, Settings (sound, volume, zoom, full screen), Debug, Coming soon; **Back to title** added |
| U2 | Debug mode: layer switches over a purple backdrop, collision and interactables, hitboxes, facing, sight, patrol paths, FPS | ✅ #181 |
| U3 | Falling through the level: keep a screenshot of where and what happened | ✅ #181 – `tmp/falls/` in dev |
| U4 | Rusty Creek's maze wobbles like leaves | ✅ #181 – built layers don't sway |
| U5 | Falling into water: something must happen | Already: splash and back to the bank – make it more visible ⏭ |

## Jam requirements (Lex, team chat 10:02)

| # | What | Status |
| --- | --- | --- |
| T1 | The jam theme **"It's spooky outside"** must show | ✅ under the title ("DEGDEV 3 - It's spooky outside."), as the loader's last line ("WARNING: It's spooky outside.") and in the credits |
| T2 | The **rubber chicken** must be in the game somehow | ✅ a secret: lost behind the garden's gate pillar, left of where you start; walk into it and it squeaks (sprite board `rubber-chicken`, synthesized squeak) |

## Scale – hero against the world

The hero is 80 px tall in a 720 px view (1/9 of the screen), as in every `art/` concept and in Hollow Knight (8–10 %). The plates are drawn bigger than that hero, though: the Hidden Garden's bench seat is 36 px above the path (0.83 m at 13 px per foot, a real seat is 0.45 m) and its gate is 240 px tall (5.5 m). So the hero reads small because the world is about 1.5–1.8× too big, not because the camera is wrong. Options: scale the hero and enemies up 1.5× (Vatsal's suggestion; sprites are drawn at higher resolution), or regenerate plates at true scale (after the jury).

## Asked of Claude

- Turn this into a checklist and go through it with Alexander one item at a time (this page).
- Tag Lex (the designer) on GitHub in the related issues – waiting for Alexander's OK, since it posts on the team's repo.

<!-- nav:start -->
<!-- nav:end -->
