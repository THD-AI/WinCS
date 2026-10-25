"""The hero's locomotion transitions as GIFs (#156 "Smooth transitions"), from the game's own code.

    python scripts/transition_gifs.py                 # every transition -> game/verification/transitions/<name>.gif
    python scripts/transition_gifs.py idle-walk-idle  # one

game/verification/transitions/trace.ts runs movement.ts, jump.ts and animation.ts as player.ts wires them (flat
ground, 120 Hz) and prints which frame shows where; this draws it at 30 fps, 2x, with the camera on the hero and
ground ticks every foot that move with the world – a foot that slides against the ticks is a foot that slides
in the game. Each GIF frame is labelled with the clip frame and the pose the body asked for.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "game" / "public" / "assets" / "sprites"
TRACE = ROOT / "game" / "verification" / "transitions" / "trace.ts"
OUT = TRACE.parent
FOOT = 13  # px per foot at stage scale (docs/04)
STEP_HZ, GIF_FPS, ZOOM = 120, 30, 2
SIZE, GROUND = (300, 250), 230  # stage px; the ground line's y (room above for the 96 px jump)
PAPER, INK, TICK = (236, 230, 216), (60, 52, 46), (150, 140, 128)


def trace() -> dict[str, list[dict]]:
    """Run trace.ts with node (type transforms on: animation.ts has parameter properties)."""
    out = subprocess.run(["node", "--experimental-transform-types", "--no-warnings", str(TRACE)],
                         capture_output=True, check=True, cwd=ROOT)
    return json.loads(out.stdout.decode("utf-8"))


def samples(frames: list[dict], step_hz: int = STEP_HZ, fps: int = GIF_FPS) -> list[dict]:
    """Every step_hz/fps-th traced step: what a 30 fps capture of the 120 Hz game would show."""
    every = max(1, round(step_hz / fps))
    return frames[::every]


def place(x: float, y: float, cam: float, size: tuple[int, int], pivot: tuple[float, float]) -> tuple[int, int]:
    """Top-left of a frame whose pivot sits at body (x, y): x relative to the camera's centre, y up from the ground."""
    w, h = size
    return round(SIZE[0] / 2 + (x - cam) - pivot[0] * w), round(GROUND + y - pivot[1] * h)


class Atlases:
    def __init__(self) -> None:
        self.cache: dict[str, tuple[Image.Image, dict]] = {}

    def frame(self, board: str, name: str) -> tuple[Image.Image, tuple[float, float]]:
        if board not in self.cache:
            data = json.loads((SPRITES / f"{board}.json").read_text(encoding="utf-8"))
            self.cache[board] = (Image.open(SPRITES / f"{board}.png").convert("RGBA"), data["frames"])
        sheet, frames = self.cache[board]
        if name not in frames:
            sys.exit(f"{board} has no frame {name}")
        r, pivot = frames[name]["frame"], frames[name].get("pivot", {"x": 0.5, "y": 1})
        return sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])), (pivot["x"], pivot["y"])


def draw(name: str, frames: list[dict], atlases: Atlases) -> Path:
    pictures = []
    for f in samples(frames):
        cam = f["x"]
        picture = Image.new("RGBA", SIZE, PAPER + (255,))
        pen = ImageDraw.Draw(picture)
        pen.line([(0, GROUND), (SIZE[0], GROUND)], fill=INK)
        first = int((cam - SIZE[0] / 2) // FOOT) * FOOT
        for wx in range(first, int(cam + SIZE[0] / 2) + FOOT, FOOT):
            sx = round(SIZE[0] / 2 + wx - cam)
            pen.line([(sx, GROUND + 1), (sx, GROUND + (6 if wx % (FOOT * 5) == 0 else 3))], fill=TICK)
        sprite, pivot = atlases.frame(f["board"], f["frame"])
        picture.alpha_composite(sprite, place(f["x"], f["y"], cam, sprite.size, pivot))
        pen.text((4, 3), f"{f['frame']}", fill=INK)
        pen.text((4, 14), f"pose {f['pose']}  t {f['t']:.2f}s", fill=TICK)
        pictures.append(picture.convert("RGB").resize((SIZE[0] * ZOOM, SIZE[1] * ZOOM), Image.NEAREST))
    # One palette for the whole GIF (the hero's colours plus paper and ink), so frames don't flicker or bloat.
    palette = pictures[len(pictures) // 2].quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    frames_p = [picture.quantize(palette=palette, dither=Image.Dither.NONE) for picture in pictures]
    path = OUT / f"{name}.gif"
    frames_p[0].save(path, save_all=True, append_images=frames_p[1:], duration=round(1000 / GIF_FPS), loop=0,
                     optimize=True)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("names", nargs="*", help="transitions to draw (default: all of trace.ts)")
    args = parser.parse_args()
    traces, atlases = trace(), Atlases()
    for name in args.names or traces:
        if name not in traces:
            sys.exit(f"trace.ts has no transition {name}: {', '.join(traces)}")
        path = draw(name, traces[name], atlases)
        print(f"{path.relative_to(ROOT).as_posix()}: {len(samples(traces[name]))} frames")


if __name__ == "__main__":
    main()
