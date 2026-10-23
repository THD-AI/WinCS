"""Draw the sprite reference boards from the real campus photos.

    photos (outside Git) + prompts (art/sprites/boards.json)
      -> GPT Image edit -> tmp/boards/raw/<id>.png          (never committed)
      -> crush: box-downscale by the board's factor, palette, magenta -> alpha
      -> art/sprites/images/<id>.png         1x sprite source, transparent
      -> art/sprites/images/<id>-preview.png nearest-upscaled for reading

Usage:
    python scripts/make_boards.py draw [ids...]   # API calls; skips raws that exist
    python scripts/make_boards.py neighbour <id> --dir down --brief 'a culvert' --config ...  # next chunk
    python scripts/make_boards.py pages [--config ...]   # one Markdown page per board + index
    python scripts/make_boards.py draw hero --redo        # ids before --redo
    python scripts/make_boards.py crush           # offline; rebuilds every committed image

Photos are found under WINCS_PHOTOS (default: ~/Downloads), with the prefixes
ref1: "GameJam_ References", ref2: "GameJam_References-2", gam: "gam",
merch: "GameJam_Merch" (public reference photos: THD Campus Store webshop.th-deg.de, the
Deggster costume from th-deg.de, Jenny from fast-forest.de).
"repo:" paths are inside this repository; "out:<id>" is another board's raw.
Needs OPENAI_API_KEY (environment or .env) for `draw`.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "art" / "sprites" / "boards.json"
RAW = ROOT / "tmp" / "boards" / "raw"
OUT = ROOT / "art" / "sprites" / "images"


def use_config(path: Path) -> None:
    """Point the script at another board set (e.g. art/direction/direction.json)."""
    global CONFIG, RAW, OUT
    CONFIG = path.resolve()
    RAW = ROOT / "tmp" / "boards" / CONFIG.parent.name / "raw"
    OUT = CONFIG.parent / "images"
PHOTOS = Path(os.environ.get("WINCS_PHOTOS", Path.home() / "Downloads"))
PREFIX = {"ref1": "GameJam_ References", "ref2": "GameJam_References-2", "gam": "gam", "merch": "GameJam_Merch"}
PAPER = (232, 228, 220)  # preview background where the magenta was
COLOURS = 96


def api_key() -> str:
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("OPENAI_API_KEY missing")


def resolve(ref: str) -> Path:
    kind, name = ref.split(":", 1)
    if kind == "repo":
        return ROOT / name
    if kind == "out":
        return RAW / f"{name}.png"
    if kind == "dl":
        return PHOTOS / name
    return PHOTOS / PREFIX[kind] / name


def upload_copy(path: Path, folder: Path) -> Path:
    """Phone photos are 4000 px and rotated by EXIF: send an upright 1536 px JPEG."""
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    image.thumbnail((1536, 1536))
    out = folder / (path.stem.replace("(", "_").replace(")", "_") + ".jpg")
    image.save(out, quality=90)
    return out


def edit(name: str, fields: dict, images: list[Path], key: str, mask: Path | None = None) -> bytes | None:
    """One images/edits call; returns PNG bytes or None (failure printed)."""
    with tempfile.TemporaryDirectory() as folder:
        # The key goes in a header file, never on the command line (it would show in tracebacks and ps).
        header = Path(folder) / "auth.txt"
        header.write_text(f"Authorization: Bearer {key}\n", encoding="utf-8")
        cmd = ["curl", "-sS", "--max-time", "1800", "https://api.openai.com/v1/images/edits", "-H", f"@{header}"]
        for field, value in {**fields, "quality": "high", "n": "1"}.items():
            cmd += ["-F", f"{field}={value}"]
        for image in images:
            kind = "png" if image.suffix == ".png" else "jpeg"
            cmd += ["-F", f"image[]=@{image};type=image/{kind}"]
        if mask:
            cmd += ["-F", f"mask=@{mask};type=image/png"]
        result = subprocess.run(cmd, capture_output=True)
    if result.returncode:
        print(f"{name}: FAILED curl exit {result.returncode} {result.stderr.decode()[:200]}", flush=True)
        return None
    data = json.loads(result.stdout or b"{}")
    if "error" in data or "data" not in data:
        print(f"{name}: FAILED {data.get('error', result.stderr.decode()[:300])}", flush=True)
        return None
    return base64.b64decode(data["data"][0]["b64_json"])


def draw(board: dict, config: dict, key: str) -> None:
    out = RAW / f"{board['id']}.png"
    # The board's own brief goes first: with the style text first the model paints a scene.
    # No title line: the model printed "BOARD: <title>" into an image as a sign.
    prompt = "\n\n".join([board["prompt"], config["style"], config["people"]])
    with tempfile.TemporaryDirectory() as folder:
        images = [upload_copy(resolve(ref), Path(folder)) for ref in board["inputs"]]
        png = edit(board["id"], {"model": board.get("model", config["model"]), "prompt": prompt,
                                 "size": board.get("size", config["size"])}, images, key)
    if png is None:
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png)
    print(f"{board['id']}: drew {out.relative_to(ROOT)}", flush=True)


NEIGHBOUR = ("This image is one chunk of a side-scrolling stage; the strip along its {edge} edge is existing art "
             "from the neighbouring chunk: keep it exactly. Paint the transparent rest as the next chunk {direction} "
             "it - the ground, walls and structures continue across the seam at the same positions, same light, "
             "palette, fine 2-pixel grain and scale, with new features that fit the route (not a copy of the "
             "neighbour). Strict side view. No characters, no text.\n\n{brief}")
EDGES = {  # direction: (edge of the NEW chunk that shows the neighbour, crop of the neighbour, paste offset)
    "right": ("left", lambda w, h, b: (w - b, 0, w, h), lambda w, h, b: (0, 0)),
    "left": ("right", lambda w, h, b: (0, 0, b, h), lambda w, h, b: (w - b, 0)),
    "up": ("bottom", lambda w, h, b: (0, 0, w, b), lambda w, h, b: (0, h - b)),
    "down": ("top", lambda w, h, b: (0, h - b, w, h), lambda w, h, b: (0, 0)),
}
WHERE = {"right": "to the right of", "left": "to the left of", "up": "above", "down": "below"}


def neighbour(board: dict, config: dict, key: str, direction: str, brief: str = "") -> None:
    """Paint the next chunk in one direction from this chunk's edge band (a third of its size).

    Writes tmp/.../<id>--<direction>.png with the shared band pixel-exact. The seam is then
    repaired with stage_art.py, and a chunk is only kept if Lex's route needs it.
    """
    chunk = Image.open(RAW / f"{board['id']}.png").convert("RGBA")
    w, h = chunk.size
    band = (w if direction in ("left", "right") else h) // 3
    edge, crop, at = EDGES[direction]
    context = chunk.crop(crop(w, h, band))
    canvas = Image.new("RGBA", (w, h))
    canvas.paste(context, at(w, h, band))
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "context.png"
        canvas.save(path)  # transparent pixels are the area to paint (also used as the mask)
        prompt = NEIGHBOUR.format(edge=edge, direction=WHERE[direction], brief=brief or board["prompt"])
        png = edit(f"{board['id']}--{direction}", {"model": board.get("model", config["model"]), "prompt": prompt,
                                                   "size": f"{w}x{h}"}, [path], key, mask=path)
    if png is None:
        return
    new = Image.open(io.BytesIO(png)).convert("RGBA").resize((w, h))
    new.paste(context, at(w, h, band))
    out = RAW / f"{board['id']}--{direction}.png"
    new.convert("RGB").save(out)
    print(f"{board['id']}: neighbour {direction} -> {out.relative_to(ROOT)}", flush=True)


def is_magenta(r: int, g: int, b: int) -> bool:
    # The key plus its anti-aliased blends into dark outlines (a dark purple fringe).
    return r - g > 60 and b - g > 60 and abs(r - b) < 100


def crush(board: dict) -> None:
    raw = RAW / f"{board['id']}.png"
    if not raw.exists():
        print(f"{board['id']}: no raw drawing yet")
        return
    image = Image.open(raw).convert("RGB")
    f = board["factor"]
    size = (image.width // f, image.height // f)
    if board.get("keyed", True):
        # Key at full size, then downscale premultiplied so no magenta bleeds into edges.
        keyed = Image.new("RGBA", image.size)
        keyed.putdata([(0, 0, 0, 0) if is_magenta(*p) else (*p, 255) for p in image.getdata()])
        small = keyed.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    else:
        small = image.resize(size, Image.Resampling.BOX).convert("RGBA")
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    colours = small.convert("RGB").quantize(board.get("colours", COLOURS), method=Image.Quantize.MEDIANCUT,
                                             dither=Image.Dither.NONE)
    sprite = colours.convert("RGBA")
    sprite.putalpha(alpha)
    small = sprite
    preview = Image.new("RGB", small.size, PAPER)
    preview.paste(sprite, mask=sprite)
    OUT.mkdir(parents=True, exist_ok=True)
    sprite.save(OUT / f"{board['id']}.png", optimize=True)
    preview.resize((small.width * f, small.height * f), Image.Resampling.NEAREST).save(
        OUT / f"{board['id']}-preview.png", optimize=True)
    print(f"{board['id']}: {small.width}x{small.height} sprite + preview")


def describe(ref: str) -> str:
    kind, name = ref.split(":", 1)
    if kind == "repo":
        return f"[{Path(name).name}]({os.path.relpath(ROOT / name, CONFIG.parent).replace(os.sep, '/')})"
    if kind == "out":
        if (CONFIG.parent / f"{name}.md").exists() or (OUT / f"{name}-preview.png").exists():
            return f"[{name}]({name}.md) (this pack)"
        return f"`{name}` (earlier draft, outside Git)"
    return f"`{name}` ({PREFIX.get(kind, 'Downloads')}, outside Git)"


def motion(folder: Path, board: dict) -> list[str]:
    """The looping previews export_atlas.py --preview wrote for this board, in atlas order."""
    names = [a["anim"] for row in board.get("atlas", {}).get("rows", []) if row != "skip" for a in row]
    gifs = [(n, folder / "previews" / f"{board['id']}--{n}.gif") for n in names]
    gifs = [(n, g) for n, g in gifs if g.exists()]
    if not gifs:
        return []
    cells = " ".join(f"![{n}](previews/{g.name})" for n, g in gifs)
    return ["## In motion", "", "At twice game size, 12 fps unless the atlas says otherwise: "
            + ", ".join(n for n, _ in gifs) + ".", "", cells, ""]


def pages(config: dict) -> None:
    """One Markdown page per board plus the index grid; navigation.py adds Previous / Next."""
    folder = CONFIG.parent
    cells = []
    for board in config["boards"]:
        preview = OUT / f"{board['id']}-preview.png"
        if not preview.exists():
            continue
        image = preview.relative_to(folder).as_posix()
        review = board.get("review", "Not reviewed yet.")
        lines = [f"# {board['title']}", "", f"![{board['title']}]({image})", "",
                 f"**Review:** {review}", "", *motion(folder, board), "## Brief", "", board["prompt"], "",
                 "## Inputs", "", *[f"- {describe(r)}" for r in board["inputs"]], "",
                 f"Model `{board.get('model', config['model'])}` · pixel factor {board['factor']} · "
                 f"source image `{image.replace('-preview', '')}` · rebuild: "
                 f"`python scripts/make_boards.py draw {board['id']} --redo --config {CONFIG.relative_to(ROOT).as_posix()}`", ""]
        (folder / f"{board['id']}.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
        cells.append(f"[![{board['title']}]({image})]({board['id']}.md)<br>**[{board['title']}]({board['id']}.md)**")
    rows = ["| | |", "| --- | --- |"] + [
        f"| {cells[i]} | {cells[i + 1] if i + 1 < len(cells) else ''} |" for i in range(0, len(cells), 2)]
    intro = config.get("readme", "")
    (folder / "README.md").write_text("\n".join([f"# {config.get('name', folder.name)}", "", intro, "", *rows, ""]),
                                      encoding="utf-8", newline="\n")
    print(f"{len(cells)} pages + index in {folder.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=["draw", "crush", "pages", "neighbour"])
    parser.add_argument("ids", nargs="*")
    parser.add_argument("--redo", action="store_true", help="draw again even if a raw exists")
    parser.add_argument("--config", type=Path, help="board set to use (default: art/sprites/boards.json)")
    parser.add_argument("--dir", choices=list(EDGES), help="neighbour: which side to grow")
    parser.add_argument("--brief", default="", help="neighbour: what the new chunk contains (Lex's route)")
    args = parser.parse_args()
    if args.config:
        use_config(args.config)
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    boards = [b for b in config["boards"] if not args.ids or b["id"] in args.ids]

    if args.step == "crush":
        for board in boards:
            crush(board)
        return
    if args.step == "pages":
        pages(config)
        return
    if args.step == "neighbour":
        if not args.dir:
            sys.exit("neighbour needs --dir left|right|up|down")
        key = api_key()
        for board in boards:
            neighbour(board, config, key, args.dir, args.brief)
        return

    key = api_key()
    todo = [b for b in boards if not b.get("locked") and (args.redo or not (RAW / f"{b['id']}.png").exists())]
    # Boards that use another board's drawing wait for it: draw in dependency waves.
    while todo:
        ready = [b for b in todo if all(
            not r.startswith("out:") or (RAW / f"{r[4:]}.png").exists() for r in b["inputs"])]
        if not ready:
            sys.exit("missing dependencies: " + ", ".join(b["id"] for b in todo))
        with ThreadPoolExecutor(3) as pool:
            list(pool.map(lambda b: draw(b, config, key), ready))
        failed = [b for b in ready if not (RAW / f"{b['id']}.png").exists()]
        if failed:
            sys.exit("failed: " + ", ".join(b["id"] for b in failed))
        todo = [b for b in todo if b not in ready]
        for board in ready:
            crush(board)


if __name__ == "__main__":
    main()
