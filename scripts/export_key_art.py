"""Export key art boards (full scenes, `"keyed": false`) as the game's menu and loading images.

    art/sprites/images/<board>.png  crushed 1x scene (make_boards.py crush)
      -> game/public/assets/ui/<board>.png   opaque RGB, at least 1280x720 (the game's view, docs/04)

The game copy is opaque (no alpha channel: a menu backdrop never shows through) and checked for size,
so a board drawn at the wrong ratio or too small stops here instead of stretching on screen.

Usage:
    python scripts/export_key_art.py menu-key [--out game/public/assets/ui]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "sprites" / "images"
OUT = ROOT / "game" / "public" / "assets" / "ui"
VIEW = (1280, 720)


def export(board: str, source: Path = SOURCE, out: Path = OUT) -> Path:
    image = Image.open(source / f"{board}.png").convert("RGB")
    if image.width < VIEW[0] or image.height < VIEW[1]:
        raise SystemExit(f"{board}: {image.width}x{image.height} is smaller than the {VIEW[0]}x{VIEW[1]} view")
    if abs(image.width / image.height - VIEW[0] / VIEW[1]) > 0.02:
        raise SystemExit(f"{board}: {image.width}x{image.height} is not 16:9")
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{board}.png"
    image.save(target, optimize=True)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("boards", nargs="+")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    for board in args.boards:
        print(f"{board} -> {export(board, out=args.out)}")


if __name__ == "__main__":
    main()
