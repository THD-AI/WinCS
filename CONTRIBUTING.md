# Contributing

The day-to-day workflow for the jam is in **[docs/12-TEAM-WORKFLOW.md](docs/12-TEAM-WORKFLOW.md)**. This page is the short version of the rules every repo of ours follows.

## Plan first

Work starts from an agreed plan, in this order:

1. **Design doc** – a section of a numbered doc in `docs/`.
2. **Concept** – for anything visible, an approved direction image or sprite board, before code or final art.
3. **Issues** – an epic with sub-issue stories, each with acceptance criteria.
4. **Branches and PRs** – only now.

A review that changes the direction goes back to step 1 or 2, not into the PR.

## Branches, commits, PRs

- Branch from `main`: `feature/`, `fix/`, `docs/`, `art/`, `chore/`. One branch and one PR per coherent task; review fixes stay on it.
- Conventional, imperative commit subjects (`feat: add ladder climbing`), ≤ 72 characters. No attribution trailers.
- Before committing: `git diff --cached --check` and `python scripts/check_docs.py`.
- Merge commits; delete merged branches. No force-pushes to shared branches, no auto-merge.

## Art

Every committed image is produced by a script from a config with real references (see [docs/09-ART-PIPELINE.md](docs/09-ART-PIPELINE.md)). Photos, audio and raw API output stay out of Git. Reference-game media in `references/games/` belongs to its rightsholders and is never shipped (see [NOTICE.md](NOTICE.md)).
