# GitHub workspace and handoff

Created 21 October 2026 under Alexander's THD-AI organization.

- [Private repository](https://github.com/THD-AI/WinCS).
- [Private project board](https://github.com/orgs/THD-AI/projects/6), linked to the repository, saved Board layout with Todo / In Progress / Done.
- [Planning hub discussion](https://github.com/THD-AI/WinCS/discussions/9).
- [Reference-quality discussion](https://github.com/THD-AI/WinCS/discussions/10).

Organization Projects were disabled; `has_organization_projects` was enabled so this board could be created. The repository and the project were separately verified private. No new collaborators, organization members, billing resources or public hosts were added. Existing organization access still applies; teammates' GitHub handles and intended access have not been supplied.

## Tracked work

| Issue | Purpose | Current readiness |
| --- | --- | --- |
| [#1](https://github.com/THD-AI/WinCS/issues/1) | Research/proposal baseline | Completed with the checked initial baseline |
| [#2](https://github.com/THD-AI/WinCS/issues/2) | Organizer rules and submission facts | Ready for a team volunteer to ask |
| [#3](https://github.com/THD-AI/WinCS/issues/3) | Vatsal's direction and support capacity | Ready for team discussion |
| [#4](https://github.com/THD-AI/WinCS/issues/4) | Engine/export spike | Blocked by #2 and #3 |
| [#5](https://github.com/THD-AI/WinCS/issues/5) | Asset contract and voluntary art budget | Needs design decision and a tested player scale |
| [#6](https://github.com/THD-AI/WinCS/issues/6) | Complete tiny game | Future work; blocked by rules, theme and team decision |
| [#7](https://github.com/THD-AI/WinCS/issues/7) | Playtest and submission | Future work; blocked by #2 and #6 |
| [#8](https://github.com/THD-AI/WinCS/issues/8) | After-jam ownership and continuation | Deferred |

Dependencies are explicit issue-body links, not claimed native blocking automation. Readiness labels supplement the three board columns. Board moves are manual initially, with GitHub's built-in close behavior where enabled; no custom token or workflow deployment is required.

## Branches, PRs and initial bootstrap

The empty repository's baseline is committed on `docs/initial-planning` and seeds remote `main` from that verified commit. No commit is made while checked out on main, and no redundant remote planning branch/empty PR is needed for the bootstrap. Subsequent work follows one issue / one typed branch / one PR, with merge commits and merged-branch deletion enabled. Squash and rebase merge options are disabled to preserve logical commits.

Use the guidance in [CONTRIBUTING.md](../CONTRIBUTING.md) for optional two-layer stacks. Branch protection and automated PR-title enforcement are **not configured**; these are documented team conventions, with document CI present. Runtime CI is deferred until a game/toolchain exists.

dotPrivate uses one dedicated `docs/wincs-planning` branch for the new submodule registration. Its pre-existing changes are excluded. Future parent gitlink updates should be consolidated at useful checkpoints, not made for every project commit.

## Immediate next step

Vatsal chooses two desired reference qualities and a provisional loop; Lex and Alexander confirm comfortable support hours; a volunteer resolves #2. No additional repository, branch, meeting invitation, public page or new game implementation is needed to have that conversation.
