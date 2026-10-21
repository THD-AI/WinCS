# Engine and export evidence

[← Previous](technical-proposal.md) · [🏠 Home](../../README.md) · [🖼️ Visual library](../../references/README.md) · [Next →](../delivery/jam-plan.md)

Checked 21 October 2026. Primary documentation supports capabilities; it cannot decide what this particular team can ship fastest. Version selection remains open until a spike.

| Candidate | Verified capability / constraint | Implication for this jam |
| --- | --- | --- |
| [Phaser](https://docs.phaser.io/phaser/getting-started/what-is-phaser) | JavaScript/TypeScript 2D framework for browser games, using WebGL/Canvas rendering | Fits browser-first scope; use existing scene/input/camera systems rather than building an engine |
| [Godot web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | Web export has browser/rendering requirements; Godot 4 C# projects currently cannot export to web; threaded export needs appropriate cross-origin isolation support | GDScript is an option, not Python itself. Test chosen export mode on final host and second browser |
| [Unity 2D](https://docs.unity3d.com/Manual/Unity2D.html) | Dedicated 2D tools including sprites, tilemaps and 2D physics | Unity is valid for 2D. Familiarity, editor installation and browser build constraints matter more than the slogan “overkill” |
| [Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | Browser drawing API, not a full game framework | Small initial setup but collision, loading, state and tooling remain team work |
| [Three.js](https://threejs.org/docs/) | JavaScript 3D library | Use only for an essential approved 3D mechanic; not required for parallax pixel art |

Delivery reference: [itch.io HTML5 documentation](https://itch.io/docs/creators/html5). A ZIP containing index.html and required files can be played in-browser; relative paths and actual hosted testing matter. Hosting permissions/visibility remain a team decision, not an account created by these notes.

Hardware reference: [Flipper developer documentation](https://developer.flipper.net/flipperzero/doxygen/) and [official specifications](https://flipperzero.one/specs). Flipper's 128×64 monochrome display and constrained native environment make this a separate port/design study. Do not promise WebGL, JavaScript runtime or an automatic browser-to-FAP conversion.

Further evaluation should record: developer familiarity, setup minutes, clean build/export success, actual download size, input feel, frame pacing, relative asset paths and available host support. Measure those on a tiny allowed spike before accepting D006.

[← Previous](technical-proposal.md) · [🏠 Home](../../README.md) · [🖼️ Visual library](../../references/README.md) · [Next →](../delivery/jam-plan.md)
