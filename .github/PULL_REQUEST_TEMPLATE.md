<!--
Title: Conventional Commits, at most 72 characters, no full stop. It becomes the merge commit's title on main.
  feat: add ladder climbing
  fix: keep the rover on its deck
  art: hero movement sheets
Inside a stack: [2/3] chore: add issue forms
Types: feat · fix · docs · refactor · perf · test · chore · build · ci · revert · art
-->

## What and why

<!-- One paragraph: what the player (or the team) can do now, and why. -->

## Issue

Closes #
<!-- "Closes #n" for the issue this PR completes, "Refs #n" for related work. Never close an epic.
     In a stack, close only this layer's issue. -->

## Stack

<!-- Delete if independent. Otherwise list it top to bottom and mark this PR:
- #90 [3/3] …
- #89 [2/3] …  ← this PR
- #88 [1/3] …
Merge bottom up with merge commits; retarget the next PR to main before merging it. -->

## Verification

- [ ] `python scripts/check_docs.py` (and `python -m unittest discover -s scripts -p "test_*.py"` if scripts changed)
- [ ] `cd game && npm run typecheck && npm run build` (game changes)
- [ ] Played on the Vercel preview (link): keyboard and gamepad
- [ ] Art: Design review on the board says Approved before export

## Screenshots

<!-- Before / after, or a GIF for movement and combat. -->
