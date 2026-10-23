# Project board and automation

[← Design docs](../README.md) · [Research: what we love](what-we-love.md) · [Event facts](degdev-3.md)

[WinCS – DEGDEV 3](https://github.com/orgs/THD-AI/projects/7) follows THD Room Finder's board ([its reference](https://github.com/arudaev/THD-Room-Finder/blob/main/docs/contributing/project-board.md)) and Voyager's workflow. Issues describe deliverables; PRs are the review queue. Epics, parked ideas and blocked work stay off the daily view. The rules for writing issues and PRs are in [CONTRIBUTING.md](../../CONTRIBUTING.md); the jam-night loop is in [12 – Team workflow](../12-TEAM-WORKFLOW.md). Set up on 23 October 2026.

## Views

| View | Layout | Filter | Purpose |
| --- | --- | --- | --- |
| [Open work](https://github.com/orgs/THD-AI/projects/7/views/1) | Board, Status columns; Priority ascending | `is:issue is:open -label:"type:epic" -label:parked -status:Blocked` | What the team can pick up now |
| [Art review](https://github.com/orgs/THD-AI/projects/7/views/2) | Table | `is:issue label:"area:art"` | Sprite sheets and plates with their Design review |
| [Milestones](https://github.com/orgs/THD-AI/projects/7/views/3) | Table | `is:issue label:"type:epic" is:open` | The six epics and their sub-issue progress |
| [Waiting](https://github.com/orgs/THD-AI/projects/7/views/4) | Table, grouped by Milestone | `is:issue is:open status:Backlog,Blocked -label:"type:epic"` | Work waiting on another issue or on someone outside the team |
| [Pull requests](https://github.com/orgs/THD-AI/projects/7/views/5) | Table, grouped by Status | `is:pr is:open` | Review and merge queue |
| [Completed](https://github.com/orgs/THD-AI/projects/7/views/6) | Table, newest Updated first | `is:closed` | Closed issues and PRs. Closed as not planned is not shipped |

## Fields

| Field | Meaning |
| --- | --- |
| Status | Backlog (waits on another issue) · Ready (start now) · In progress · In review · Blocked (waits outside the team) · Done (merged and live) |
| Priority | P0 the slice fails without it, never cut · P1 needed · P2 first to cut ([cut order](../10-JAM-PLAN.md)) |
| Size | XS < 30 min · S ≈ 1 h · M 2–3 h · L 4+ h, split if you can · XL split it |
| Design review | Art only: Approved · Changes needed · Not started. Alexander's decision, separate from PR review |
| Start date | First observed In progress or In review; set once |
| Target date | Only a real deadline. Milestones carry the jam deadlines |
| Completed date | Issue closure or PR merge date |
| Milestone, Labels, Assignees, Parent issue, Sub-issues progress, Linked pull requests, Reviewers | Native GitHub data |

Ready vs Backlog is the jam's one deviation from Room Finder: with 60 issues and one night, *Ready* has to mean "you can start this right now". Dependencies are native **blocked by** relationships on each issue; when the last blocker closes, whoever closed it moves the waiting cards to Ready.

## Automation

| Trigger | Result | Mechanism |
| --- | --- | --- |
| Open issue or PR in THD-AI/WinCS | Added to the board | Native auto-add: `is:issue,pr is:open` |
| Sub-issue added | Added to the board | Native auto-add sub-issues |
| Item added | Backlog | Native workflow |
| PR linked to an issue | In progress | Native workflow |
| Changes requested / approved | In progress / In review | Native workflows |
| Issue closed / PR merged | Done | Native workflows |
| Issue reopened | Ready | Native workflow |
| Card moved to Done | Does **not** close the issue | Auto-close disabled |
| Draft / ready PR | In progress / In review, for the PR and its `Closes` issue | `project-sync.yml` |
| PR closed without merge | PR Backlog; its issue Ready, only if no other open PR closes it | `project-sync.yml` |
| First active state / closure | Start / Completed date | `project-sync.yml` |
| Daily, or run by hand | Repair missed transitions and dates | `project-sync.yml` |
| PR opened or edited | Conventional title (an optional `[n/N] ` stack prefix allowed), a linked issue, author assigned, `area:*` labels from paths | `pr-conventions.yml` |
| `/take`, `/drop` on an issue | Assign / unassign the commenter, reply with a branch name | `issue-commands.yml` |
| Last sub-issue closed | Epic gets `ready-for-acceptance` and a comment; it is never closed automatically | `sub-issue-rollup.yml` |

A merge into a stacked branch never completes an issue; only the merge into `main` does. `Refs #n` never claims or moves a task.

### Credentials

`project-sync.yml` needs a repository secret **`PROJECTS_TOKEN`**: a fine-grained personal access token with access to the THD-AI organisation, **Projects: read and write**, plus **Issues** and **Pull requests: read** on THD-AI/WinCS. The workflow checks out only `main`, never runs code from a PR with that token, and fails visibly when the secret is missing or expired. The other three workflows use the built-in `GITHUB_TOKEN`. Alexander owns the token and its expiry (set it to expire after the jam).

```bash
gh secret set PROJECTS_TOKEN -R THD-AI/WinCS
```

### Repository settings

Merge commits only (squash and rebase off), automatic branch deletion **off** so stacked PRs keep their base branches, Discussions on for ideas.

[← Design docs](../README.md) · [Research: what we love](what-we-love.md) · [Event facts](degdev-3.md)
