# Contributing

Vatsal leads the game direction. A discussion explores options, an issue defines an accepted task, and a PR contains a checked change. A planning issue is not automatic permission to build a feature before team/rules approval.

## Small workflow

1. Pick a ready issue and agree an owner and file boundary. Keep new ideas in Ideas discussions until chosen.
2. Use `feature/<issue>-<slug>`, `fix/…`, `docs/…` or `chore/…` from main. One branch and one PR per coherent task. Review fixes stay there.
3. Write conventional imperative commits (`docs: define the traversal prototype`). Include reason and checks when useful. All repository commits use `arudaev <hlexhelftd@gmail.com>` as requested by Alexander; no attribution trailers.
4. Reference `Closes #n` or `Refs #n` and document tests/remaining choices. Review staged files and run `git diff --cached --check` and `python scripts/check_docs.py`.
5. Maintainer reviews and merges with merge commits; delete merged topic branches. Agents do not merge, publish, enable auto-merge or rewrite shared history.

No branch per doc, person, AI session or tiny fix. No permanent dev branch. At jam scale, prefer sequential small merges over a stack. If a genuine dependent epic needs a stack, keep at most two active layers, state the base PR and blocker, and merge bottom-up. Use available GitHub native dependency facilities only after checking their current support; no stack tooling is a prerequisite to participate.

## Board and issue states

Use the GitHub project's default **Todo / In Progress / Done** states. Within Todo, `status:needs-decision` marks unresolved choices; `status:ready` means an owner can start. Labels `type:research`, `type:decision`, `type:task`, `type:bug` and `area:event`, `area:design`, `area:art`, `area:tech`, `area:delivery` identify work. Keep only one active implementation issue per person.

Board updates are manual initially; no bot token, comment command handler or broad automation is necessary. Mark a task Done after evidence is linked and acceptance criteria pass. Use native parent/sub-issues or dependency relationships if the current GitHub API/UI supports them; links in bodies remain readable fallbacks. Avoid dozens of empty tickets for hypothetical mechanics.

## Checks now and later

Current checks verify Markdown local links, reference structure and repository hygiene. External sources are dated evidence and can disappear; report broken/blocked sources rather than invent replacements. When a game exists, add build/type checks and actual playthrough checks before declaring it ready. Every production change updates the relevant design/decision document when behavior differs.

## Continuing after the jam

Tag the submitted build only with maintainer approval. Preserve its commit and credits. Triage feedback into bugs versus possible expansions; keep the original playable loop intact. Do not expand into a full Metroidvania or integrate Voyager without a new team decision. Reassess ownership, contributor credit, asset licenses, public-source licensing and hosting cost before public release.
