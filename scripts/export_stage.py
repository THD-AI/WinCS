"""Export stage regions for the game: the docs/13 stage manifest, its layer plates and collision.

    art/stages/<region>/export.json   chunks (grid x/y, art name), layers (file pattern, z, scroll),
                                      the layers each state draws, in draw order
      -> game/public/assets/stages/<region>/stage.json   the manifest the loader (#24) reads
      -> game/public/assets/stages/<region>/<files>      plates and collision, each copied once

The output is generated, never committed (the plates already live in art/stages/). Only the
standard library is needed, so the game's dev and build scripts can run it; --verify needs Pillow
and rebuilds every state from the exported files, in manifest order, against the region's art.

export.json:
    {"chunks": {"rc-0-0": {"x": 0, "y": 0, "name": "left"}},
     "layers": {"01-distance": {"file": "images/01-distance-{name}.png", "z": 1, "scroll": 0.2}},
     "states": {"anomaly": ["01-distance", ...], "clean": [...]},
     "composed": {"anomaly": "images/after-{name}.png"},          # what --verify compares with
     # a layer with "region": true is one plate for the whole region (per chunk, plates at scroll != 1
     # overlap or leave gaps), cut into chunk-wide tiles: "file" takes {tile}, chunk j carries tile j;
     # "rest": the chunk's own plate it was quilted from, which --verify rebuilds the chunk with
     "aliases": "media-sources.json"}                               # optional: shared plates

Usage:
    python scripts/export_stage.py [art/stages/<region> ...] [--out game/public/assets/stages] [--verify]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGES = ROOT / "art" / "stages"
OUT = ROOT / "game" / "public" / "assets" / "stages"
SIZE = [2160, 720]
# Region data the game loads next to stage.json when a region has it (docs/15 contracts), copied as is.
DATA_FILES = ("atmosphere.json", "surfaces.json")


class ExportError(Exception):
    """The export config or the art doesn't add up; the message says where."""


def source(region: Path, pattern: str, name: str, aliases: dict) -> Path:
    """The real file behind a layer pattern, following a shared-plate alias."""
    path = Path(pattern.format(name=name))
    alias = aliases.get(path.name)
    real = region / (path.parent / alias if alias else path)
    if not real.exists():
        raise ExportError(f"{region.name}: {real.relative_to(region)} does not exist")
    return real


def manifest(region: Path) -> tuple[dict, dict[str, Path]]:
    """The stage.json content and the files to copy (published name -> source)."""
    config = json.loads((region / "export.json").read_text(encoding="utf-8"))
    aliases = {}
    if config.get("aliases"):
        aliases = json.loads((region / config["aliases"]).read_text(encoding="utf-8")).get("aliases", {})
    files: dict[str, Path] = {}
    published: dict[Path, str] = {}

    def publish(path: Path) -> str:
        if path not in published:
            name = path.name
            if name in files:  # same file name from another folder: keep both
                name = f"{path.parent.name}-{name}"
            published[path] = name
            files[name] = path
        return published[path]

    chunks = []
    for chunk_id, chunk in config["chunks"].items():
        states = {}
        for state, layer_ids in config["states"].items():
            layers = []
            for layer_id in layer_ids:
                if layer_id not in config["layers"]:
                    raise ExportError(f"{region.name}: state {state} draws unknown layer {layer_id!r}")
                layer = config["layers"][layer_id]
                if layer.get("off"):  # kept in the art (and --verify), left out of the game
                    continue
                if layer.get("region"):  # one plate for the region in chunk-wide tiles; chunk j carries tile j
                    tile = region / layer["file"].format(tile=chunk["x"])
                    if chunk["y"] != 0 or not tile.exists():
                        continue
                    entry = {"id": layer_id, "z": layer["z"], "scroll": layer["scroll"], "file": publish(tile)}
                    if layer.get("dy"):
                        entry["dy"] = layer["dy"]
                    layers.append(entry)
                    continue
                plate = source(region, layer["file"], chunk.get("name", chunk_id), aliases)
                entry = {"id": layer_id, "z": layer["z"], "scroll": layer["scroll"], "file": publish(plate)}
                if layer.get("dy"):  # a plate painted off its ground, moved down onto it (drawn and verified there)
                    entry["dy"] = layer["dy"]
                layers.append(entry)
            collision = region / f"{chunk_id}.{state}.collision.json"
            states[state] = {"layers": layers, "collision": publish(collision) if collision.exists() else None}
        chunks.append({"id": chunk_id, "x": chunk["x"], "y": chunk["y"], "states": states})
    stage = {"region": region.name, "chunkSize": config.get("chunkSize", SIZE),
             "note": "Generated by scripts/export_stage.py from art/stages/; layers are listed in draw order.",
             "chunks": chunks}
    return stage, files


def export(region: Path, out: Path) -> dict:
    stage, files = manifest(region)
    target = out / region.name
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for name, path in files.items():
        shutil.copyfile(path, target / name)
    for name in DATA_FILES:  # optional region data the game loads next to stage.json
        if (region / name).exists():
            try:
                data = json.loads((region / name).read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                raise ExportError(f"{region.name}: {name} is not valid JSON ({error})") from error
            shutil.copyfile(region / name, target / name)
            # "assets": extra images in the region folder the file refers to (atmosphere.json)
            for asset in data.get("assets", []) if isinstance(data, dict) else []:
                path = region / asset
                if Path(asset).is_absolute() or ".." in Path(asset).parts or not path.is_file():
                    raise ExportError(f"{region.name}: {name} lists asset {asset!r}, which is not a file in the region")
                (target / asset).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target / asset)
    (target / "stage.json").write_text(json.dumps(stage, indent=1) + "\n", encoding="utf-8", newline="\n")
    return stage


def verify(region: Path, out: Path) -> list[str]:
    """Rebuild every chunk state from the exported plates and compare with the region's art.

    A region-wide parallax plate ("region": true) is not the chunk's own picture: for it, the chunk's
    "rest" plate (its own filled layer, what the region plate was quilted from) stands in."""
    from PIL import Image, ImageChops  # only --verify needs Pillow

    config = json.loads((region / "export.json").read_text(encoding="utf-8"))
    stage = json.loads((out / region.name / "stage.json").read_text(encoding="utf-8"))
    aliases = json.loads((region / config["aliases"]).read_text(encoding="utf-8")).get("aliases", {})         if config.get("aliases") else {}

    def rest(pattern: str, name: str) -> Path:
        path = ROOT / pattern.format(name=name)
        return path if path.exists() or path.name not in aliases else path.parent / aliases[path.name]

    report = []
    for chunk in stage["chunks"]:
        name = config["chunks"][chunk["id"]].get("name", chunk["id"])
        for state, content in chunk["states"].items():
            pattern = config.get("composed", {}).get(state)
            if not pattern:
                continue
            exported = {layer["id"]: out / region.name / layer["file"] for layer in content["layers"]}
            # A chunk below or above the level row has no region-wide plates (manifest() skips them): its own
            # layers alone rebuild it.
            rests = {lid: rest(L["rest"], name) for lid, L in config["layers"].items() if L.get("region")} \
                if chunk["y"] == 0 else {}
            if any(not path.exists() for path in rests.values()):
                report.append(f"{chunk['id']}.{state} (not checked: its region plates' sources are not in tmp/)")
                continue
            canvas = Image.new("RGBA", tuple(stage["chunkSize"]), (0, 0, 0, 0))
            for layer_id in config["states"][state]:
                layer = config["layers"][layer_id]
                if layer.get("region") and chunk["y"] != 0 or layer_id not in exported and not layer.get("region"):
                    continue  # not drawn for this chunk (a row away from the level, or a layer it has no pixels in)
                path = rests[layer_id] if layer.get("region") else exported[layer_id]
                plate = Image.open(path).convert("RGBA")
                if layer.get("dy"):
                    moved = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                    moved.paste(plate, (0, layer["dy"]))
                    plate = moved
                canvas = Image.alpha_composite(canvas, plate)
            art = Image.open(region / pattern.format(name=name)).convert("RGB")
            if ImageChops.difference(canvas.convert("RGB"), art).getbbox():
                raise ExportError(f"{region.name}/{chunk['id']}.{state}: the exported layers don't rebuild "
                                  f"{pattern.format(name=name)}")
            report.append(f"{chunk['id']}.{state}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="*", type=Path, help="region folders (default: every one with an export.json)")
    parser.add_argument("--out", type=Path, default=OUT, help="output folder (default: game/public/assets/stages)")
    parser.add_argument("--verify", action="store_true", help="rebuild each state from the export and compare (Pillow)")
    args = parser.parse_args()
    regions = args.regions or sorted(p.parent for p in STAGES.glob("*/export.json"))
    try:
        for region in regions:
            stage = export(region, args.out)
            states = sum(len(c["states"]) for c in stage["chunks"])
            files = len(list((args.out / region.name).iterdir())) - 1
            line = f"{region.name}: {len(stage['chunks'])} chunks, {states} states, {files} files"
            if args.verify:
                line += f"; rebuilt exactly: {', '.join(verify(region, args.out))}"
            print(line)
    except ExportError as error:
        sys.exit(f"export_stage: {error}")


if __name__ == "__main__":
    main()
