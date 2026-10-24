# Contributing

How work gets planned, picked up, branched, reviewed and merged here. Part 1 is the workflow every one of our repos follows (the same as THD Room Finder and Voyager). Part 2 is what's specific to WinCS. The jam-night version, with setup and who does what, is **[docs/12 – Team workflow](docs/12-TEAM-WORKFLOW.md)**.

---

## Part 1 – Workflow

### Plan first

Work starts from an agreed plan, in this order:

1. **Design doc** – a section of a numbered doc in `docs/`.
2. **Concept** – for anything visible, an approved direction image or sprite sheet, before code or final art.
3. **Issues** – an epic with sub-issue stories, each with acceptance criteria.
4. **Branches and PRs** – only now.

A review that changes the direction goes back to step 1 or 2, not into the PR.

### Issues

Every piece of work is an issue on the [project board](https://github.com/orgs/THD-AI/projects/7). New issues use the forms (*New issue* → pick a type); blank issues are off. Loose ideas go to [Discussions](https://github.com/THD-AI/WinCS/discussions) first.

| Type | Label | Title | Delivered by | Use when |
| --- | --- | --- | --- | --- |
| Epic | `type:epic` | `[M1] Outcome in plain words` | Its sub-issues | A milestone outcome. One epic per milestone |
| Story | `type:story` | `[M1-S3] What the player can do` | One PR | A player notices the change |
| Task | `type:task` | `[M0-S4] Imperative technical outcome` | One PR | Tooling, pipeline, collision data, docs |
| Spike | `type:spike` | `[M0-S12] Spike: the question` | A decision written down | A question with a time box |
| Bug | `type:bug` | `Bug: what is wrong` | One PR | Something broken |

- **One milestone, one epic.** The epic owns its stories as native **sub-issues** (Relationships → *Add sub-issue*), not as checklists.
- **One child, one PR.** Too big for one PR? Split the child. Numbers (`S1`, `S2`, …) are given in creation order and never reused.
- **Dependencies** are native **blocked by** relationships, separate from parent/child.
- A story says who wants what and why (*As a player, I want …, so that …*), then acceptance criteria someone else can check without asking you, then how it's verified.

Labels: exactly one `type:*`; one or more `area:*` (PRs get theirs from changed paths); temporary workflow labels `needs-triage`, `needs-design`, `needs-decision`, `ready-for-acceptance`, `parked`; and `no-issue` for a trivial PR. **Status, priority and size are board fields, not labels.**

### The board

[WinCS – DEGDEV 3](https://github.com/orgs/THD-AI/projects/7) is the one project for this repo. Columns:

`Backlog` → `Ready` → `In progress` → `In review` → `Done`, plus `Blocked`.

| Status | Means |
| --- | --- |
| Backlog | Shaped, but waits on another issue (see its *blocked by*) |
| Ready | Can start now: criteria clear, nothing blocks it |
| In progress | A branch or a draft PR exists |
| In review | A PR is ready for review |
| Blocked | Waits on something outside the team: organisers, access, a decision |
| Done | Merged to `main` **and** live on the jam URL |

Fields: **Priority** (P0 never cut · P1 needed · P2 first to cut), **Size** (XS < 30 min · S ≈ 1 h · M 2–3 h · L 4+ h · XL split it), **Design review** (art only: Approved · Changes needed · Not started), and the dates. What each view is for and what moves cards automatically: [the board reference](docs/research/github-automation.md).

### Branches

```
<type>/<issue>-<short-slug>      feature/27-walk-and-run   fix/88-rover-falls-through   art/60-hero-movement
```

Branch from `main`, or from the PR below you when stacking. `main` is always deployable; nothing is committed to it directly.

### Commits

[Conventional Commits](https://www.conventionalcommits.org): `type: imperative subject`, at most 72 characters, lower case, no full stop.

`feat` · `fix` · `docs` · `refactor` · `perf` · `test` · `chore` · `build` · `ci` · `revert` · `art` (assets only: sprite sheets, stage plates, sound)

The body, when there is one, says *why*. **No AI attribution anywhere**: no co-author trailers, no "generated with" footers – not in commits, PRs, issues or comments.

### Pull requests

- **One idea per PR.** If the description needs the word "also", it's two PRs.
- **Small.** Aim for under ~400 changed lines of code. Generated art, lockfiles and exports don't count, but go in their own commit.
- **Linked.** `Closes #n` for the issue this PR completes, `Refs #n` for related work. Never close an epic from a PR.
- **Verified.** The template asks how: type check, build, and for anything you can see, the Vercel preview and a screenshot.
- **Ready, not draft.** Open the PR ready for review as soon as you push (Alexander, 24 Oct: never as a draft); keep pushing to it until every acceptance box is ticked.
- **Merge commits**, not squash. Stacks depend on it, and the commits tell the story.

### Stacked PRs

When a change is bigger than one small PR, split it into a **stack**: each PR targets the branch of the one below it instead of `main`, so each shows only its own diff.

```
main
 └─ docs/77-team-workflow        PR [1/3]  base: main
     └─ chore/78-issue-forms     PR [2/3]  base: docs/77-team-workflow
         └─ ci/79-board-automation PR [3/3]  base: chore/78-issue-forms
```

**Opening a stack**

1. Branch each layer from the one below: `git switch -c chore/78-issue-forms docs/77-team-workflow`.
2. Open each PR with `--base` set to the branch below it.
3. Title it `[n/total] type: subject`.
4. Put the stack in every PR body, top to bottom, and mark where you are:

   ```
   ### Stack
   - #90 [3/3] ci: board automation
   - #89 [2/3] chore: issue forms  ← this PR
   - #88 [1/3] docs: team workflow
   ```

**Changing a lower PR after review starts** – commit the fix on the lower branch, then merge it upward one layer at a time (`git switch <upper> && git merge <lower>`). No force-pushes once anyone may have looked at a branch.

**Merging a stack** – bottom up, one at a time, with merge commits:

1. Point the next PR at `main` first: `gh pr edit <n+1> --base main`.
2. Wait until GitHub shows `[1/n]` as mergeable, then merge it. Keep its branch for now.
3. Repeat with the next one.
4. Delete the branches only when the whole stack is in.

The order matters. Deleting a branch from the CLI or API closes the PRs that sit on it instead of retargeting them, and merging an upper PR first lands it in the branch below instead of `main`, so its issue doesn't close. Automatic branch deletion on merge is off in this repo for that reason.

### Previews

Every PR gets a Vercel preview once the game is deployed ([M0-S2](https://github.com/THD-AI/WinCS/issues/23)). Review the change there – play it for 30 seconds – before approving. `main` is the jam URL.

---

## Part 2 – WinCS

### Art

Every committed image is produced by a script from a config with real references ([docs/09 – Art pipeline](docs/09-ART-PIPELINE.md)). Art issues carry a **Design review** value on the board; Alexander sets it to Approved before a sheet is exported into the game. Photos, audio and raw API output stay out of Git. Reference-game media in `references/games/` belongs to its rightsholders and is never shipped ([NOTICE.md](NOTICE.md)).

### Checks before you push

```bash
git diff --cached --check
python scripts/check_docs.py
python -m pytest scripts                                 # if scripts changed
cd game && npm run typecheck && npm test && npm run build  # game code
python scripts/compare.py lineup hero-move:walk-03 …       # on-screen changes: the comparison for the PR
```

### Test and review a PR

Every PR that changes what's on screen is checked against the references before it merges ([AGENTS.md – reference fidelity](AGENTS.md#reference-fidelity--every-agent-every-change-you-can-see)). Alexander reviews; nothing merges before his corrections are in.

**1 · Look at the comparison.** The PR body links a `scripts/compare.py` image: the approved reference above and ours below at game size with one ruler grid, or frames lined up against their documented heights (magenta ticks). Sizes, ratios and positions should match; the PR body names anything that doesn't and why.

**2 · Play it.** Either the Vercel preview linked by the Vercel bot in the PR (needs the Vercel login), or locally:

```bash
npm --prefix game ci
npm --prefix game run dev          # http://localhost:5173 – stages are generated first
```

| In the game | What it does |
| --- | --- |
| A / D or ← → · Space or K · W / S | walk (hold to run) · jump (hold for higher) · climb ladders; ↓ + Jump drops through decks |
| J · Tab or Esc | act · pocket computer (once you have it) |
| `?region=hidden-garden&state=clean` | start in another region or state (`rusty-creek`, `anomaly`) |
| `?inspect` (dev) | drag to pan the stage freely, no camera follow |
| F2 (dev) | the hero's debug readout: speed, jump height, slope, body box |
| F3 (dev) | Jenny's boss bar at 70 % |
| F4 then Tab (dev) | hand over the pocket computer, then open the map |
| F6 / F7 (dev) | step through the sound loops / effects; M mutes |
| F8 (dev) | the THD.exe crossing |
| Shift + F4 (dev) | Dexter at the coffee machine: bow, sweat, the pocket computer and a muffin, then he absorbs a pool; Tab opens the map after |
| Shift + F8 (dev) | the end of the slice: Dexter absorbs, the glitch, "To be continued.", the credits |
| F9 / F10 (dev) | anomaly FX / atmosphere test chunks (V toggles, A switches the leaves, Esc closes) |

Dev keys exist only in `npm run dev`, never in the preview or production build. Movement keys and the URL options arrive with lane B's stack (#111 → …).

**3 · Answer on the PR.** Comment per point (what's off, which reference), or set the board's **Design review** to *Changes needed*. The author fixes it on the same branch, re-runs the comparison and asks again. Approval is your comment or Design review = *Approved*; only then does the PR merge.
