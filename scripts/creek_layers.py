"""Build registered creek layers from scene art; never regenerate a depth plate.

Pillow performs the requested mask/canvas work. Image generation supplies the
scene-first sources and bounded repairs. No network, credentials or game runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'art/stages/rusty-creek'
INPUTS = BASE / 'inputs'
WORK = ROOT / 'tmp/stages/rusty-creek'  # derived seam-repair inputs, never committed
W, H = 2160, 720
CHUNKS = ('left', 'center', 'right')
ROLES = ('01-distance', '02-supports', '03-bank', '04-water',
         '05-traversal', '06-near-rails', '07-foliage')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def blank(width=W):
    return Image.new('RGBA', (width, H))


def canonical(image):
    image = image.convert('RGBA').resize((W, H), Image.Resampling.NEAREST)
    image.putdata([(r, g, b, a) if a else (0, 0, 0, 0)
                   for r, g, b, a in image.getdata()])
    return image


def remove_matte(image):
    """Remove saturated red debug matte, not orange/brown rust. Retain source."""
    result = image.copy()
    result.putdata([(0, 0, 0, 0) if a and r > 160 and g < 85 and b < 75
                    and r > 2 * g else (r, g, b, a)
                    for r, g, b, a in result.getdata()])
    return result


def changed(a, b):
    return sum(pixel != (0, 0, 0, 0)
               for pixel in ImageChops.difference(a, b).getdata())


def mirrored(image, index):
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if index % 2 else image.copy()


def shifted(image, dy):
    out = blank()
    out.alpha_composite(image, (0, dy))
    return out


def split_structure(image, boxes):
    """Disjoint masonry regions, not two independently redrawn paintings."""
    mask = Image.new('L', image.size)
    draw = ImageDraw.Draw(mask)
    for box in boxes:
        draw.rectangle(box, fill=255)
    rear = blank()
    front = blank()
    rear.paste(image, (0, 0), mask)
    front.paste(image, (0, 0), ImageChops.invert(mask))
    proof = Image.alpha_composite(rear, front)
    if changed(proof, image):
        raise ValueError('Structure partition loses or duplicates source pixels')
    return rear, front


def save_once(image, path, aliases):
    """Shared scenery repeats on the right chunk: keep one file, record an alias."""
    twin = path.with_name(path.name.replace('-right.png', '-left.png'))
    if path != twin and twin.exists() and not changed(Image.open(twin).convert('RGBA'), image.convert('RGBA')):
        aliases[path.name] = twin.name
        return
    image.save(path)


def plate_path(name, data=None):
    """An export's file, following the alias for a right chunk stored as its left twin."""
    data = data or read(BASE / 'media-sources.json')
    return BASE / 'images' / data.get('aliases', {}).get(name, name)


def compose(plates, architecture=None):
    # Bank is behind the architecture; near rails and leaves can occlude it.
    out = blank()
    for role in ('01-distance', '03-bank', '02-supports', '05-traversal',
                 '06-near-rails', '07-foliage', '04-water'):
        layer = architecture if role == '02-supports' and architecture is not None else plates[role]
        if architecture is not None and role == '05-traversal':
            continue
        out = Image.alpha_composite(out, layer)
    return out


def route_errors(route):
    errors = []
    nodes = {n['id']: n for n in route['nodes']}
    if len(nodes) != len(route['nodes']):
        errors.append('duplicate route node')
    adjacency = {key: set() for key in nodes}
    for node in nodes.values():
        x, y = node['at']
        if not (0 <= x <= 3 * W and 32 <= y <= 650):
            errors.append('route node outside review world: ' + node['id'])
    for edge in route['edges']:
        a, b = edge['from'], edge['to']
        if a not in nodes or b not in nodes:
            errors.append('unknown edge endpoint')
            continue
        adjacency[a].add(b)
        if edge.get('bidirectional', True):
            adjacency[b].add(a)
        dx = abs(nodes[a]['at'][0] - nodes[b]['at'][0])
        dy = abs(nodes[a]['at'][1] - nodes[b]['at'][1])
        if edge['kind'] == 'ladder' and dx > 8:
            errors.append('ladder is not vertical: ' + a)
        if edge['kind'] == 'jump' and (dx > 180 or dy > 120):
            errors.append('jump exceeds proposed movement envelope: ' + a)
    reached = {route['entry']}
    pending = list(reached)
    while pending:
        for node in adjacency[pending.pop()] - reached:
            reached.add(node)
            pending.append(node)
    if set(nodes) - reached:
        errors.append('unreachable route nodes: ' + ', '.join(sorted(set(nodes) - reached)))
    if route['exit'] not in reached or route['boss'] not in reached:
        errors.append('entry cannot reach boss and exit')
    dead_ends = [n['id'] for n in route['nodes'] if n.get('purpose') == 'optional dead end']
    if not dead_ends or any(len(adjacency[n]) != 1 for n in dead_ends):
        errors.append('optional dead ends must have one return connection')
    return errors


def build():
    config = read(BASE / 'assembly.json')
    old = INPUTS
    WORK.mkdir(parents=True, exist_ok=True)
    original = {}
    removals = {}
    for chunk in CHUNKS:
        source = canonical(Image.open(BASE / 'sources' / f'{chunk}.png'))
        clean = remove_matte(source)
        removals[chunk] = changed(source, clean)
        # Preserve the exact input bytes used to prepare the recorded packet.
        normalized = remove_matte(Image.open(BASE / 'sources' / f'{chunk}.png').convert('RGBA').resize((W, H), Image.Resampling.NEAREST))
        normalized.save(WORK / f'{chunk}-normalized.png')
        original[chunk] = clean
    world = blank(3 * W)
    for i, chunk in enumerate(CHUNKS):
        world.alpha_composite(original[chunk], (i * W, 0))
    unpatched = world.copy()
    for index, join in enumerate(('left--center', 'center--right')):
        candidate = canonical(Image.open(BASE / 'sources' / f'structure--{join}-candidate.png'))
        x = (index + 1) * W - 256
        world.paste(candidate.crop((824, 0, 1336, H)), (x, 0))
    protected = Image.new('L', world.size, 255)
    pen = ImageDraw.Draw(protected)
    for seam in (W, 2 * W):
        pen.rectangle((seam - 256, 0, seam + 255, H - 1), fill=0)
    before = blank(3 * W)
    after = blank(3 * W)
    before.paste(unpatched, (0, 0), protected)
    after.paste(world, (0, 0), protected)
    if changed(before, after):
        raise ValueError('Repair changed protected pixels')
    # Matte cleanup is a separate explicit post-repair step, never hidden in the
    # bounded-copy invariant. Raw repaired source and hashes remain auditable.
    cleaned_world = remove_matte(world)
    removals['post_repair'] = changed(world, cleaned_world)
    far = canonical(Image.open(old / 'depth-01-far.png'))
    bank = shifted(remove_matte(canonical(Image.open(old / 'depth-03-bank.png'))), 90)
    water = canonical(Image.open(old / 'depth-04-water.png'))
    rails = shifted(remove_matte(canonical(Image.open(old / 'depth-06-rails.png'))), 90)
    clean_arch = remove_matte(canonical(Image.open(old / 'depth-02-structure.png')))
    plants_source = remove_matte(canonical(Image.open(BASE / 'sources/plants.png')))
    plants = blank()
    plants.alpha_composite(plants_source.resize((W, 504), Image.Resampling.NEAREST), (0, 263))
    outputs = BASE / 'images'
    outputs.mkdir(exist_ok=True)
    for stale in outputs.glob('*.png'):
        stale.unlink()
    aliases = {}
    for i, chunk in enumerate(CHUNKS):
        structure = canonical(cleaned_world.crop((i * W, 0, (i + 1) * W, H)))
        rear, traversal = split_structure(structure, config['masonry_regions'][chunk])
        foliage = mirrored(plants, i)
        # The boss floor must stay readable; this is an explicit authored alpha
        # mask, not automatic semantic segmentation or a claim of a clean rig.
        if chunk == 'right':
            transparent = blank()
            foliage.paste(transparent.crop((1050, 0, 1800, 590)), (1050, 0))
        plates = dict(zip(ROLES, (mirrored(far, i), rear, mirrored(bank, i),
                                 mirrored(water, i), traversal, mirrored(rails, i), foliage)))
        for role, plate in plates.items():
            save_once(plate, outputs / f'{role}-{chunk}.png', aliases)
        architecture = mirrored(clean_arch, i)
        save_once(architecture, outputs / f'clean-architecture-{chunk}.png', aliases)
        compose(plates).convert('RGB').save(outputs / f'after-{chunk}.png')  # previews: rebuilt, never edited
        compose(plates, architecture).convert('RGB').save(outputs / f'before-{chunk}.png')
    errors = route_errors(read(BASE / 'route.json'))
    if errors:
        raise ValueError('; '.join(errors))
    # Snapshot reviewed exports; verify mode checks actual files against it.
    records = []
    for path in sorted([*outputs.glob('*.png'), *(BASE / 'sources').glob('*.png')]):
        im = Image.open(path)
        records.append({'file': path.relative_to(BASE).as_posix(), 'sha256': digest(path),
                        'dimensions': list(im.size), 'mode': im.mode,
                        'alpha_extrema': list(im.getchannel('A').getextrema()) if im.mode == 'RGBA' else None})
    inputs = [old / f'depth-{name}.png' for name in ('01-far', '02-structure', '03-bank', '04-water', '06-rails')]
    inputs += [ROOT / 'references/campus/images/crossings.png']
    inputs += [INPUTS / f'maze-{chunk}.png' for chunk in CHUNKS]
    write(BASE / 'media-sources.json', {'date': '2026-10-23',
          'method': 'Built-in image generation; exact prompts in prompts.json. Deterministic masks and assembly in scripts/creek_layers.py.',
          'images': records, 'source_inputs': [{'project_file': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in inputs],
          'aliases': aliases,
          'layer_order': list(ROLES), 'shared_roles': [ROLES[i] for i in (0, 2, 3, 5, 6)],
          'packet': read(BASE / 'packet.json'),
          'configuration_hashes': {name: digest(BASE / name) for name in ('assembly.json', 'route.json', 'stage.json', 'prompts.json')},
          'source_graph': {'architecture': 'sources/{chunk}.png -> explicit normalization/matte cleanup -> bounded repairs -> disjoint masks -> role/chunk exports',
                           'shared_nature': 'earlier fixed source -> explicit offset/mirroring -> same role export in both states',
                           'foliage': 'sources/plants.png -> explicit vertical scale/offset and boss alpha window -> shared role7',
                           'masters': 'registered exports in assembly draw order; clean swaps role2 and omits role5'},
          'acceptance': {'team_art_approval': False, 'physics_verified': False, 'per_object_rigs': False}})
    write(BASE / 'verification.json', {'world_size': [3 * W, H], 'layer_chunks': 21,
          'structure_partition_changed_pixels': 0, 'outside_repair_changed_pixels': 0,
          'shared_role_source_differences': 0, 'red_matte_pixels_removed': removals,
          'route_graph_errors': [], 'graph_is_not_physics': True,
          'repair_report': read(BASE / 'repair-report.json')})
    verify()


def verify():
    data = read(BASE / 'media-sources.json')
    for name, expected in data['configuration_hashes'].items():
        if digest(BASE / name) != expected:
            raise ValueError('Changed assembly contract: ' + name)
    actual = {p.relative_to(BASE).as_posix() for folder in ('images', 'sources')
              for p in (BASE / folder).glob('*.png')}
    if actual != {item['file'] for item in data['images']}:
        raise ValueError('Image inventory differs')
    for item in data['images']:
        path = BASE / item['file']
        im = Image.open(path)
        if digest(path) != item['sha256'] or list(im.size) != item['dimensions'] or im.mode != item['mode']:
            raise ValueError('Changed asset: ' + item['file'])
        if im.mode == 'RGBA' and list(im.getchannel('A').getextrema()) != item['alpha_extrema']:
            raise ValueError('Alpha differs: ' + item['file'])
    for item in data['source_inputs']:
        if digest(ROOT / item['project_file']) != item['sha256']:
            raise ValueError('Changed fixed input: ' + item['project_file'])
    for chunk in CHUNKS:
        plates = {role: Image.open(plate_path(f'{role}-{chunk}.png', data)).convert('RGBA') for role in ROLES}
        for role, im in plates.items():
            low, high = im.getchannel('A').getextrema()
            if im.size != (W, H) or (role != ROLES[0] and (low != 0 or high == 0)):
                raise ValueError('Noncanonical or missing alpha: ' + role)
        for name, architecture in (('after', None), ('before', Image.open(plate_path(f'clean-architecture-{chunk}.png', data)))):
            expected = compose(plates, architecture).convert('RGB')
            master = Image.open(BASE / 'images' / f'{name}-{chunk}.png').convert('RGB')
            if ImageChops.difference(master, expected).getbbox():
                raise ValueError('Master recomposition differs: ' + name + '-' + chunk)
    # Shared nature uses exact matching edge columns, not an opacity blend.
    for role in data['shared_roles']:
        for left, right in zip(CHUNKS, CHUNKS[1:]):
            a = Image.open(plate_path(f'{role}-{left}.png', data)).convert('RGBA')
            b = Image.open(plate_path(f'{role}-{right}.png', data)).convert('RGBA')
            # The authored boss window only touches the interior of the right chunk.
            if a.crop((W-1, 0, W, H)).tobytes() != b.crop((0, 0, 1, H)).tobytes():
                raise ValueError('Shared scenery boundary differs: ' + role)
    errors = route_errors(read(BASE / 'route.json'))
    if errors:
        raise ValueError('; '.join(errors))
    print('Verified 21 registered plates, six masters, exact recomposition, alpha, sources and route graph. Physics/art approval remain separate.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', action='store_true', help='Rebuild explicitly approved derived mask exports in place')
    args = parser.parse_args()
    build() if args.build else verify()
