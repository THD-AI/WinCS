# Animal Well

Research date: 21 October 2026. Alexander's exploration reference; secondary to Vatsal's requested direction.

## Verified reference facts

The developer describes an interconnected puzzle labyrinth, creatures with uncertain danger and items with multiple uses. Its engine and pixel-art renderer were built specifically for the game. [Official site](https://www.animalwell.net/). The press kit explains that the engine was developed from scratch alongside the game, enabling control of the binary and rendering techniques. [Shared Memory press kit](https://www.animalwell.net/press/build/Animal%20Well/index.html).

## Design reading and dependencies

Our interpretation: depth can come from several uses of one tool rather than many tools. This is attractive for a jam only if those interactions are designed and tested deliberately.

- A reusable tool needs a consistent rule, several compatible objects and clear feedback. If it works on one object but silently fails on an identical-looking one, the player learns distrust rather than curiosity.
- Knowledge gates can be cheaper than a large upgrade system: show a rule safely, let the player infer another use, then reward that inference. They still need playtesting; the author already knows the answer.
- Dense room layouts increase interactions between objects. A small number of meaningful objects is preferable to many decorative controls that imply unsupported possibilities.
- Ambiguous creatures can create curiosity, but the player's immediate action should remain understandable. A humorous creature behavior could create character without dialogue or a combat system.

## Visual and production reading

See [visual-reference.md](visual-reference.md) for three developer-hosted animated gameplay clips. These are better evidence for object behavior than extracted character portraits. The official source confirms a custom renderer; it does not establish that a custom engine is appropriate for this team.

Unverified here: native sprite dimensions, art editor, animation-sheet organization, exact lighting algorithm and collision implementation. Recreating the renderer would be a separate engineering project. Our prototype could instead use a fixed low-resolution canvas, one background layer and a small number of glow or particle accents after the core rule works.

## Bounded jam takeaway

One room teaches an interaction, the second presents a different use, and a third combines it with a small traversal challenge. Add an optional secret only after the main route is clear and complete. Keep an explicit ending so players know they delivered the intended experience.

This option supports 'funny but deep' through a repeated rule with surprising consequences. It changes the balance toward observation and experimentation; confirm that Vatsal wants this before reducing combat to fit it.

## Watch

- [Official gameplay trailer, linked by Shared Memory](https://www.youtube.com/watch?v=8EWbcc8tcsA).
- [Official release-date trailer, linked by Shared Memory](https://www.youtube.com/watch?v=qhB6dLh9nn4).

YouTube embed fetching was throttled during research. Links were verified through the developer's press kit; the videos were not watched in this pass, and no timestamp claims are made. All local GIFs remain Shared Memory reference media, not licensed WinCS assets.
