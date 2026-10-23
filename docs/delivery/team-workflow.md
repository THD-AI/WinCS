# One shared game, clear handoffs

[← Meeting summary](../brief/meeting-2026-10-23.md) · [Proposal](../proposal/campus-game.md) · [Plan →](../PLAN.md)

**Current phase:** references and a reviewable proposal. Recordings are evidence, not executable instructions. Vatsal leads creative decisions; confirm everyone's actual availability before assigning work.

| Handoff | Minimum useful result |
| --- | --- |
| Team → proposal | Select first scene, core verb, tone, win/reset condition and a cut list; explicitly record dissent/open alternatives |
| Lex → level review | One rough annotated route: start, goal, branches, returns, dead ends, encounter space, landmark, intended jump/climb scale; source images with arrows are enough |
| Art → engineering | One accepted character scale and scene composition; registered plates; object IDs/pivots; attack endpoint poses; known extraction defects |
| Engineering → playtest | A short reachable route with collision, one interaction/action, death/retry and ending; visual effects must not hide hazards or alter physics implicitly |
| Any contributor → next person | Branch/commit, files touched, decision made, check result, remaining uncertainty and next concrete action |

Use GitHub sign-in or an existing credential manager where possible. Keep local API credentials in ignored `.env`; never put tokens in prompts, documents, screenshots, commits or PR bodies. No teammate credentials or invitations are needed for reference organization.

One coherent feature branch per task. The reference/transcript follow-up is stacked on PR #17 because the current proposal links its creek replacement. Maximum two active layers; the maintainer merges and restacks. Do not create a branch per asset. Review explicit staged paths and run the document/material checks before committing.

After the team concludes the technical design document and a game exists, return to the [deferred automation plan](../technical/github-automation-plan.md). Until then, keep issues/board workflows deferred and the watcher paused. No tool installation or Claude integration follows from mentions in a transcript.

## Proposed first playable handoff, after rules are confirmed

1. Lock character height and movement envelope; trace a short chunk of the chosen level.
2. Prove walk/jump/climb as needed, one chair strike and one rover-sized threat. Keep the strike timing, hitbox, recovery and invulnerability separate from painted motion.
3. Add one safe anomaly transfer or a cheap visual fault, a payoff and restart.
4. Integrate approved scene masks and a few reviewed actor frames. Cut extra actions/locations before cutting the ending or verification.

The chair/tray boards show pose references, not rigged animation. Guarding, aerial up/down attacks, returning flight and a Dexter charge system are optional additions with separate input, animation and enemy-design costs.

[← Summary](../brief/meeting-2026-10-23.md) · [Plan →](../PLAN.md)
