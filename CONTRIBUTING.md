# Contributing

[← Previous](docs/github-workspace.md) · [🏠 Home](README.md) · [🖼️ Visual library](references/README.md) · [Next →](NOTICE.md)

Vatsal leads the game direction. Right now we browse references, explore playful ideas and edit documents. Issues and the project board have been deleted; recreate them only once the game technical design document is concluded. A PR can contain a checked document change without an issue.

## Small workflow

1. Agree a small task, owner and file boundary. Keep new ideas in Ideas discussions until chosen.
2. Use `feature/<slug>`, `fix/…`, `docs/…` or `chore/…` from main. One branch and one PR per coherent task. Review fixes stay there.
3. Write conventional imperative commits (`docs: define the traversal prototype`). Include reason and checks when useful. All repository commits use `arudaev <hlexhelftd@gmail.com>` as requested by Alexander; no attribution trailers.
4. Explain checks and remaining choices; issue links are optional while tracking is deferred. Review staged files and run `git diff --cached --check` and `python scripts/check_docs.py`.
5. Maintainer reviews and merges with merge commits; delete merged topic branches. Agents do not merge, publish, enable auto-merge or rewrite shared history.

No branch per doc, person, AI session or tiny fix. No permanent dev branch. At jam scale, prefer sequential small merges over a stack. If a genuine dependent epic needs a stack, keep at most two active layers, state the base PR and blocker, and merge bottom-up. Use available GitHub native dependency facilities only after checking their current support; no stack tooling is a prerequisite to participate.

## Tracking comes after design

Do not recreate the deleted backlog or board during reference gathering. Once the game technical design document is concluded, create tasks from the chosen game and one private board. Templates and labels can stay unused until then.

When there is a game and tracking returns, use the [THD Room Finder-style automation plan](docs/technical/github-automation-plan.md). It covers automatic linking, issue closure after maintainer merge to main, board/review states, sub-issue roll-up and repair of missed events. No new metadata workflows are active yet.

## Visual documents

Open game studies with an image and a short “look for this” cue. Keep provenance and deeper notes below. Every study/gallery has Previous / Library / Next links at both ends. Standard relative Markdown works across GitHub, Obsidian and Logseq. Update the trail with `python scripts/refresh_reference_navigation.py` after changing the reading order.

## Checks now and later

Current checks verify Markdown local links, reference structure and repository hygiene. External sources are dated evidence and can disappear; report broken/blocked sources rather than invent replacements. When a game exists, add build/type checks and actual playthrough checks before declaring it ready. Every production change updates the relevant design/decision document when behavior differs.

## Continuing after the jam

Tag the submitted build only with maintainer approval. Preserve its commit and credits. Triage feedback into bugs versus possible expansions; keep the original playable loop intact. Do not expand into a full Metroidvania or integrate Voyager without a new team decision. Reassess ownership, contributor credit, asset licenses, public-source licensing and hosting cost before public release.

[← Previous](docs/github-workspace.md) · [🏠 Home](README.md) · [🖼️ Visual library](references/README.md) · [Next →](NOTICE.md)
