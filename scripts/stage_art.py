"""Prepare layer-local edits and splice only reviewed repair bands back into a strip.

Pillow handles deterministic canvas work; semantic image repair belongs to imagegen.
No network call occurs without the explicit submit --execute command.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'gpt-image-2.5-sunburst'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def source(root, value):
    path = (root / value).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f'Source must be an existing file inside the project: {value}')
    return path


def token(value):
    if not isinstance(value, str) or not value or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in value):
        raise ValueError(f'Use lowercase IDs containing letters, digits, hyphen or underscore: {value!r}')
    return value


def load_config(path, root=ROOT):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    w, h = data['panel_size']
    if not isinstance(w, int) or not isinstance(h, int) or w < 4 or h < 1 or w % 2:
        raise ValueError('Panel width must be a positive even integer; height must be positive')
    order = data['chunks']
    if len(order) < 2 or len(set(order)) != len(order):
        raise ValueError('At least two unique ordered chunk IDs are required')
    for key in order:
        token(key)
    layers = data['layers']
    if not layers or len({layer['id'] for layer in layers}) != len(layers):
        raise ValueError('Layer IDs must be present and unique')
    for layer in layers:
        token(layer['id'])
        if set(layer['panels']) != set(order):
            raise ValueError(f'{layer["id"]}: every shared chunk ID needs exactly one panel')
        for file in layer['panels'].values():
            source(root, file)
    return data


def fitted(path, size, allow_normalize=False):
    with Image.open(path) as original:
        im = original.convert('RGBA')
        if im.size != tuple(size):
            drift = max(abs(im.width / size[0] - 1), abs(im.height / size[1] - 1))
            if not allow_normalize or drift > .02:
                raise ValueError(f'{Path(path).name}: native size {im.size} differs from {tuple(size)}; explicit nearest-neighbor normalization allows at most 2%')
            im = im.resize(tuple(size), Image.Resampling.NEAREST)
        return im


def prepare(config, output, band=384, root=ROOT):
    cfg = load_config(config, root)
    w, h = cfg['panel_size']
    if band <= 0 or band % 2 or band > w // 2:
        raise ValueError('Repair band must be even and at most half a panel wide')
    output = Path(output)
    if output.exists():
        raise ValueError('Packet directory already exists; retain it or choose a new version')
    # Validate/decode all inputs before creating the packet.
    decoded = {}
    for layer in cfg['layers']:
        for key in cfg['chunks']:
            decoded[layer['id'], key] = fitted(source(root, layer['panels'][key]), (w, h), cfg.get('normalize_inputs', False))
    output.mkdir(parents=True)
    packet = {'version': 1, 'config_sha256': digest(config), 'panel_size': [w, h],
              'world_size': [w * len(cfg['chunks']), h], 'chunks': cfg['chunks'],
              'chunk_origins': {key: [i*w, 0] for i, key in enumerate(cfg['chunks'])},
              'model': cfg.get('model', MODEL), 'layers': [], 'jobs': []}
    for layer in cfg['layers']:
        name = layer['id']
        world = Image.new('RGBA', tuple(packet['world_size']))
        inputs = []
        for i, key in enumerate(cfg['chunks']):
            file = source(root, layer['panels'][key])
            im = decoded[name, key]
            world.paste(im, (i*w, 0))  # Replacement preserves RGBA, including holes.
            with Image.open(file) as native:
                inputs.append({'chunk': key, 'file': layer['panels'][key], 'sha256': digest(file),
                               'native_size': list(native.size), 'normalized_size': [w, h]})
        world_file = f'{name}-before.png'
        world.save(output / world_file)
        packet['layers'].append({'id': name, 'role': layer['role'], 'world': world_file,
                                 'sha256': digest(output / world_file), 'inputs': inputs})
        for i in range(1, len(cfg['chunks'])):
            job_id = f'{name}--{cfg["chunks"][i-1]}--{cfg["chunks"][i]}'
            folder = output / job_id
            folder.mkdir()
            x0 = i*w - w//2
            context = world.crop((x0, 0, x0+w, h))
            context.save(folder / 'context.png')
            # API convention: fully transparent means editable; opaque means protect.
            lo, hi = w//2 - band//2, w//2 + band//2
            mask = Image.new('RGBA', (w, h), (255, 255, 255, 255))
            mask.paste((0, 0, 0, 0), (lo, 0, hi, h))
            mask.save(folder / 'edit-mask.png')
            copy_mask = Image.new('L', (w, h), 0)
            copy_mask.paste(255, (lo, 0, hi, h))
            copy_mask.save(folder / 'copy-mask.png')
            prompt = (
                f'Repair one actual join of the {layer["role"]} layer in a flat side-scrolling pixel-art stage. '
                'Image 1 is the exact staggered context canvas, not a style reference. '
                f'The seam lies at x={w//2}. Change only the band x=[{lo},{hi}); '
                'image 2 shows the edit mask (transparent means editable). '
                'Continue existing silhouettes, steel edges, foliage, waterlines or reflections as appropriate; '
                'connect matching platform ends without deleting branches or inventing a new camera. '
                'Keep every pixel outside the band, original scale, palette and flat projection. '
                'Transparent holes stay transparent; no matte, labels, HUD, glow or new scenery layer. '
                f'Output the complete {w}x{h} context canvas, not a tight crop. '
                + layer.get('repair_direction', '')
            )
            (folder / 'prompt.txt').write_text(prompt + '\n', encoding='utf-8', newline='\n')
            request = {'model': packet['model'], 'size': f'{w}x{h}', 'quality': 'high',
                       'output_format': 'png', 'background': 'transparent' if layer.get('transparent') else 'opaque',
                       'n': 1, 'image': 'context.png', 'mask': 'edit-mask.png', 'prompt_file': 'prompt.txt'}
            write_json(folder / 'request.json', request)
            packet['jobs'].append({'id': job_id, 'layer': name, 'context_origin': [x0, 0],
                                   'copy_box': [lo, 0, hi, h], 'context_sha256': digest(folder / 'context.png'),
                                   'edit_mask_sha256': digest(folder / 'edit-mask.png'),
                                   'copy_mask_sha256': digest(folder / 'copy-mask.png'),
                                   'prompt_sha256': digest(folder / 'prompt.txt'),
                                   'request_sha256': digest(folder / 'request.json')})
    write_json(output / 'packet.json', packet)
    return packet


def load_packet(folder):
    folder = Path(folder)
    packet = json.loads((folder / 'packet.json').read_text(encoding='utf-8'))
    for layer in packet['layers']:
        if digest(folder / layer['world']) != layer['sha256']:
            raise ValueError('Prepared world changed; prepare a new version')
    for job in packet['jobs']:
        token(job['id'])
        for name, key in [('context.png', 'context_sha256'), ('edit-mask.png', 'edit_mask_sha256'),
                          ('copy-mask.png', 'copy_mask_sha256'), ('prompt.txt', 'prompt_sha256'),
                          ('request.json', 'request_sha256')]:
            if digest(folder / job['id'] / name) != job[key]:
                raise ValueError(f'{job["id"]}: stale/tampered {name}')
    return packet


def apply(folder, candidates, output, normalize=False):
    folder, candidates, output = map(Path, (folder, candidates, output))
    packet = load_packet(folder)
    if output.exists():
        raise ValueError('Output directory already exists; choose a new version')
    # Require the complete selected packet; never silently skip a layer/join.
    decoded = {j['id']: fitted(candidates / (j['id'] + '.png'), packet['panel_size'], normalize) for j in packet['jobs']}
    output.mkdir(parents=True)
    report = {'automatic_art_approval': False, 'visual_seams_approved': False,
              'packet_sha256': digest(folder / 'packet.json'), 'layers': [], 'repairs': []}
    for layer in packet['layers']:
        before = Image.open(folder / layer['world']).convert('RGBA')
        after = before.copy()
        allowed = Image.new('L', before.size, 0)
        for job in (j for j in packet['jobs'] if j['layer'] == layer['id']):
            box, origin = job['copy_box'], job['context_origin']
            region = decoded[job['id']].crop(tuple(box))
            destination = (origin[0]+box[0], box[1])
            after.paste(region, destination)  # Replace alpha too; alpha_composite would retain deleted pixels.
            allowed.paste(255, (destination[0], destination[1], destination[0]+region.width, destination[1]+region.height))
            with Image.open(candidates/(job['id']+'.png')) as native:
                native_size = list(native.size)
            report['repairs'].append({'job': job['id'], 'candidate_sha256': digest(candidates/(job['id']+'.png')),
                                      'native_size': native_size, 'applied_size': packet['panel_size'],
                                      'normalization': 'nearest-neighbor' if native_size != packet['panel_size'] else 'none',
                                      'world_box': [destination[0], destination[1], destination[0]+region.width, destination[1]+region.height]})
        diff = ImageChops.difference(before, after)
        outside = ImageChops.invert(allowed)
        # Include all channels: RGBA getbbox alone can miss RGB-only changes at zero alpha.
        changed_outside = any(ImageChops.multiply(channel, outside).getbbox() for channel in diff.split())
        if changed_outside:
            raise AssertionError('Protected pixels changed')
        out_file = layer['id'] + '-repaired.png'
        after.save(output / out_file)
        report['layers'].append({'id': layer['id'], 'file': out_file, 'sha256': digest(output/out_file),
                                  'dimensions': list(after.size), 'outside_repair_changed_pixels': 0})
    write_json(output / 'report.json', report)
    return report


def submit(folder, job_id, cli, execute=False):
    folder = Path(folder)
    packet = load_packet(folder)
    job = next((j for j in packet['jobs'] if j['id'] == job_id), None)
    if job is None:
        raise ValueError('Unknown packet job ID')
    job_dir = folder / job_id
    request = json.loads((job_dir / 'request.json').read_text(encoding='utf-8'))
    if request['model'] != packet['model']:
        raise ValueError('Model changed; prepare a new packet')
    candidate = folder / 'candidates' / (job_id+'.png')
    if candidate.exists():
        raise ValueError('Candidate already exists; no implicit overwrite or paid retry')
    cli = Path(cli).resolve()
    if not cli.is_file():
        raise ValueError('Pass the installed imagegen skill CLI path via --cli')
    # The installed CLI accepts the model but validates custom sizes as legacy for 2.5.
    # Use auto in this adapter; the packet retains exact desired size for a future updated client.
    args = [sys.executable, str(cli), 'edit', '--model', request['model'], '--image', str(job_dir/'context.png'),
            '--mask', str(job_dir/'edit-mask.png'), '--prompt-file', str(job_dir/'prompt.txt'),
            '--size', 'auto', '--quality', 'high', '--background', request['background'],
            '--output-format', 'png', '--out', str(candidate)]
    if execute:
        if not os.environ.get('OPENAI_API_KEY'):
            raise ValueError('OPENAI_API_KEY is absent; dry-run/manual packets remain usable')
        candidate.parent.mkdir(exist_ok=True)
    else:
        args.append('--dry-run')
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    if execute:
        write_json(job_dir/'submission.json', {'model': request['model'], 'candidate_sha256': digest(candidate),
                                              'requested_size': request['size'], 'adapter_size': 'auto'})
    return {'executed': execute, 'model': request['model'], 'adapter_size': 'auto', 'desired_size': request['size'],
            'candidate': str(candidate)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare'); p.add_argument('--config', required=True); p.add_argument('--out', required=True); p.add_argument('--band', type=int, default=384)
    p = sub.add_parser('apply'); p.add_argument('--packet', required=True); p.add_argument('--candidates', required=True); p.add_argument('--out', required=True); p.add_argument('--normalize', action='store_true')
    p = sub.add_parser('submit'); p.add_argument('--packet', required=True); p.add_argument('--job', required=True); p.add_argument('--cli', required=True); p.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    try:
        if args.command == 'prepare':
            packet = prepare(args.config, args.out, args.band)
            print(f'Prepared {len(packet["jobs"])} layer-local seam jobs; no API call.')
        elif args.command == 'apply':
            report = apply(args.packet, args.candidates, args.out, args.normalize)
            print(f'Repaired {len(report["layers"])} layers; all pixels outside repair bands are unchanged. Visual approval remains separate.')
        else:
            print(json.dumps(submit(args.packet, args.job, args.cli, args.execute), indent=2))
    except (ValueError, FileNotFoundError, KeyError, subprocess.CalledProcessError) as error:
        # Do not echo provider output, credentials, prompts or image payloads on failures.
        parser.exit(1, f'{type(error).__name__}: {error if not isinstance(error, subprocess.CalledProcessError) else "Image CLI failed; inspect its local configuration."}\n')


if __name__ == '__main__':
    main()
