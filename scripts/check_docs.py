"""Check authored documentation without a network or third-party dependencies."""
from pathlib import Path
import hashlib
import json
import re
import sys
import struct
import subprocess
from urllib.parse import unquote
import xml.etree.ElementTree as ET
from refresh_reference_navigation import navigation

ROOT = Path(__file__).resolve().parents[1]
errors = []
markdown = sorted(p for p in ROOT.rglob('*.md') if '.git' not in p.parts)
for path in markdown:
    text = path.read_text(encoding='utf-8-sig')
    for target in re.findall(r'\]\(([^)]+)\)', text):
        target = target.strip().split(' "', 1)[0].strip('<>')
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        relative = unquote(target.split('#', 1)[0])
        if relative and not (path.parent / relative).exists():
            errors.append(f'{path.relative_to(ROOT)}: missing local target {target}')
    if '\x00' in text:
        errors.append(f'{path.relative_to(ROOT)}: NUL byte')

pages = json.loads((ROOT / 'references/reading-order.json').read_text(encoding='utf-8'))
paths = [page['path'] for page in pages]
if len(paths) != len(set(paths)):
    errors.append('Duplicate page in reference reading order')
for index, page in enumerate(pages):
    path = ROOT / page['path']
    if not path.is_file():
        errors.append(f'Missing reading-trail page: {page["path"]}')
        continue
    text = path.read_text(encoding='utf-8')
    if text.count(navigation(pages, index)) != 2:
        errors.append(f'{page["path"]}: expected current Previous / Library / Next links at both ends')
    first_image = re.search(r'!\[[^\]]*\]\(', text)
    first_visual = first_image
    if not first_visual or first_visual.start() > 1600:
        errors.append(f'{page["path"]}: missing early visual preview')

games = ROOT / 'references' / 'games'
expected_games = {
    'hollow-knight', '9-years-of-shadows', 'metroid-dread', 'apple-knight',
    'animal-well', 'soul-knight', 'drova-forsaken-kin', 'kingdom-two-crowns',
    'kingdom-eighties', 'stardew-valley', 'children-of-morta', 'planet-of-lana',
    'dead-cells',
    'terraria', 'little-nightmares', 'duck-season',
    'secret-of-monkey-island', 'infinity-blade',
}
image_count = 0
if games.exists():
    actual_games = {p.name for p in games.iterdir() if p.is_dir()}
    expected_paths = {f'references/games/{name}/{file}' for name in expected_games for file in ('README.md', 'visual-reference.md')}
    if set(paths) != expected_paths:
        errors.append('Reference trail must include every named game study and gallery exactly once')
    for missing in sorted(expected_games - actual_games):
        errors.append(f'Missing named game: {missing}')
    for folder in sorted(p for p in games.iterdir() if p.is_dir()):
        for required in ('README.md', 'visual-reference.md'):
            if not (folder / required).is_file():
                errors.append(f'{folder.relative_to(ROOT)}: missing {required}')
        manifest = folder / 'media-sources.json'
        if manifest.exists():
            data = json.loads(manifest.read_text(encoding='utf-8-sig'))
            declared = [item['file'] for item in data['screenshots']]
            actual = {p.relative_to(folder).as_posix() for p in (folder / 'images').glob('*')}
            if len(declared) != len(set(declared)) or set(declared) != actual:
                errors.append(f'{folder.relative_to(ROOT)}: image manifest must cover each image exactly once')
            for item in data['screenshots']:
                media = folder / item['file']
                if not media.is_file():
                    errors.append(f'{media.relative_to(ROOT)}: missing media')
                elif hashlib.sha256(media.read_bytes()).hexdigest() != item['sha256']:
                    errors.append(f'{media.relative_to(ROOT)}: source hash mismatch')
        for media in (folder / 'images').glob('*'):
            raw = media.read_bytes()
            if not raw.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff', b'GIF87a', b'GIF89a')):
                errors.append(f'{media.relative_to(ROOT)}: unexpected image signature')
            if media.name not in (folder / 'visual-reference.md').read_text(encoding='utf-8'):
                errors.append(f'{media.relative_to(ROOT)}: no visual-reference entry')
            image_count += 1
else:
    errors.append('Missing game reference library')

campus = ROOT / 'references/campus'
if campus.exists():
    sources = json.loads((campus / 'source-index.json').read_text(encoding='utf-8'))['photos']
    if len(sources) != 59 or {p['id'] for p in sources} != {f'C{i:02}' for i in range(1, 60)}:
        errors.append('Campus source index must cover all 59 photographs exactly once')
    manifest = json.loads((campus / 'media-sources.json').read_text(encoding='utf-8'))
    expected_boards = {'campus', 'hidden-gardens', 'lost-in-the-green', 'creek', 'crossings', 'playground', 'toxic-garden', 'campus-robot'}
    if len(manifest['collages']) != len(expected_boards) or {p.get('id', Path(p['file']).stem) for p in manifest['collages']} != expected_boards:
        errors.append('Campus collage manifest must retain eight separate location/item identities')
    declared = [item['file'] for item in manifest['collages']]
    actual = {p.relative_to(campus).as_posix() for p in (campus / 'images').glob('*')}
    if len(declared) != len(set(declared)) or set(declared) != actual:
        errors.append('Campus manifest must cover each active collage exactly once')
    prompts = json.loads((campus / 'prompts.json').read_text(encoding='utf-8'))['prompts']
    source_ids = {p['id'] for p in sources}
    if any(p['board'] not in expected_boards for p in sources):
        errors.append('Campus source index has an unknown board identity')
    for item in manifest['collages']:
        media = campus / item['file']
        if not media.is_file() or hashlib.sha256(media.read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Campus collage missing or changed: {item["file"]}')
        elif not media.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
            errors.append(f'Campus collage is not PNG: {item["file"]}')
        if item['prompt_key'] not in prompts or not set(item['source_ids']) <= source_ids:
            errors.append(f'Campus collage has invalid prompt/source mapping: {item["file"]}')
    route = json.loads((campus / 'reading-order.json').read_text(encoding='utf-8'))
    route_paths = [page['path'] for page in route]
    if len(route_paths) != len(set(route_paths)) or set(route_paths) != {f'references/campus/{name}.md' for name in expected_boards}:
        errors.append('Campus reading trail must include each location/item study once')
    for index, page in enumerate(route):
        path = ROOT / page['path']
        if not path.is_file() or path.read_text(encoding='utf-8').count(navigation(route, index, 'references/campus/README.md')) != 2:
            errors.append(f'{page["path"]}: missing current two-ended campus navigation')
    original_names = {p['filename'] for p in sources}
    for path in ROOT.rglob('*'):
        if '.git' in path.parts or 'tmp' in path.parts:
            continue
        if path.is_file() and (path.name in original_names or re.match(r'^(?:\d+ )?WhatsApp ', path.name) or path.suffix.lower() == '.ogg'):
            errors.append(f'Unexpected original photo/voice asset: {path.relative_to(ROOT)}')
    voices = json.loads((ROOT / 'docs/brief/voice-source-index.json').read_text(encoding='utf-8'))['recordings']
    if len(voices) != 10 or len({p['id'] for p in voices}) != 10:
        errors.append('Voice source index must cover ten distinct recordings')

animation = ROOT / 'references/animation/playground'
if animation.exists():
    frames = json.loads((animation / 'media-sources.json').read_text(encoding='utf-8'))['screenshots']
    declared = [item['file'] for item in frames]
    actual = {p.relative_to(animation).as_posix() for p in (animation / 'images').glob('*')}
    if len(declared) != len(set(declared)) or set(declared) != actual:
        errors.append('Playground manifest must cover every selected frame exactly once')
    gallery = (animation / 'README.md').read_text(encoding='utf-8')
    for item in frames:
        media = animation / item['file']
        if not media.is_file() or hashlib.sha256(media.read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Playground frame missing or changed: {item["file"]}')
        elif not media.read_bytes().startswith(b'\xff\xd8\xff'):
            errors.append(f'Playground frame is not JPEG: {item["file"]}')
        if item['file'] not in gallery or not item.get('credit') or not item.get('source_page'):
            errors.append(f'Playground frame lacks gallery/source/credit: {item["file"]}')
        timestamp = item.get('timestamp_seconds')
        if not isinstance(timestamp, int) or not 0 <= timestamp < 72:
            errors.append(f'Playground frame has invalid source time: {item["file"]}')

production = ROOT / 'references/production/master-first'
if production.exists():
    trial = json.loads((production / 'media-sources.json').read_text(encoding='utf-8'))
    trial_prompts = json.loads((production / 'prompts.json').read_text(encoding='utf-8'))['prompts']
    declared = [item['file'] for item in trial['images']]
    actual = {p.relative_to(production).as_posix() for p in (production / 'images').glob('*')}
    if len(declared) != len(set(declared)) or set(declared) != actual:
        errors.append('Scene-first trial manifest must cover every image exactly once')
    for item in trial['images']:
        media = production / item['file']
        if not media.is_file():
            errors.append(f'Scene-first trial missing: {item["file"]}')
            continue
        raw = media.read_bytes()
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            errors.append(f'Scene-first trial hash mismatch: {item["file"]}')
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) < 26:
            errors.append(f'Scene-first trial is not PNG: {item["file"]}')
        elif list(struct.unpack('>II', raw[16:24])) != item['dimensions']:
            errors.append(f'Scene-first trial dimensions differ: {item["file"]}')
        elif item['mode'] == 'RGBA' and raw[25] != 6:
            errors.append(f'Scene-first alpha trial lacks RGBA color type: {item["file"]}')
        if item['prompt_key'] not in trial_prompts or item['file'] not in (production / 'README.md').read_text(encoding='utf-8'):
            errors.append(f'Scene-first trial lacks prompt/gallery entry: {item["file"]}')
    if len({tuple(item['dimensions']) for item in trial['images']}) != 1:
        errors.append('Scene-first trial images must share a canvas')
    for item in trial['source_inputs']:
        source = production / item['file']
        if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Scene-first input board missing or changed: {item["file"]}')

strip_study = ROOT / 'references/production/crossings-strip'
if strip_study.exists():
    strip_data = json.loads((strip_study / 'media-sources.json').read_text(encoding='utf-8'))
    strip_prompts = json.loads((strip_study / 'prompts.json').read_text(encoding='utf-8'))['prompts']
    strip_images = strip_data['images']
    strip_declared = [item['file'] for item in strip_images]
    strip_actual = {p.relative_to(strip_study).as_posix() for p in (strip_study / 'images').glob('*')}
    if len(strip_declared) != len(set(strip_declared)) or set(strip_declared) != strip_actual:
        errors.append('Flat-strip provenance must cover every image exactly once')
    strip_gallery = (strip_study / 'README.md').read_text(encoding='utf-8')
    for item in strip_images:
        media = strip_study / item['file']
        if not media.is_file():
            errors.append(f'Flat-strip image missing: {item["file"]}')
            continue
        raw = media.read_bytes()
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            errors.append(f'Flat-strip image changed: {item["file"]}')
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) < 26:
            errors.append(f'Flat-strip image is not PNG: {item["file"]}')
        elif list(struct.unpack('>II', raw[16:24])) != item['dimensions']:
            errors.append(f'Flat-strip native dimensions differ: {item["file"]}')
        elif raw[25] != {'RGB': 2, 'RGBA': 6}.get(item['mode']):
            errors.append(f'Flat-strip PNG color type differs: {item["file"]}')
        if item['prompt_key'] not in strip_prompts or item['file'] not in strip_gallery:
            errors.append(f'Flat-strip image lacks prompt/gallery entry: {item["file"]}')
        for source in item['inputs']:
            source_file = strip_study / source['file']
            if not source_file.is_file() or hashlib.sha256(source_file.read_bytes()).hexdigest() != source['sha256']:
                errors.append(f'Flat-strip source missing or changed: {source["file"]}')
    expected_origins = {
        'clean': [[0, 0], [2172, 0], [4344, 0]],
        'overlap': [[1086, 0], [3258, 0]],
        'traversal': [[0, 0], [2172, 0], [4344, 0]],
        'depth': [[2172, 0]] * 7,
    }
    for kind, origins in expected_origins.items():
        if [item['review_origin'] for item in strip_images if item['kind'] == kind] != origins:
            errors.append(f'Flat-strip {kind} windows differ from the documented review coordinates')
    viewer = (strip_study / 'viewer.html').read_text(encoding='utf-8')
    for target in re.findall(r'(?:src|href)="([^"]+)"', viewer):
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) and not (strip_study / target.split('#')[0]).exists():
            errors.append(f'Flat-strip viewer missing target: {target}')
    for item in strip_images:
        if Path(item['file']).name not in viewer:
            errors.append(f'Flat-strip viewer lacks image: {item["file"]}')

seams = ROOT / 'references/production/seam-pipeline'
if seams.exists():
    seam_data = json.loads((seams / 'media-sources.json').read_text(encoding='utf-8'))
    seam_prompts = json.loads((seams / 'prompts.json').read_text(encoding='utf-8'))['prompts']
    seam_gallery = (seams / 'README.md').read_text(encoding='utf-8')
    seam_declared = [item['file'] for item in seam_data['images']]
    seam_actual = {p.relative_to(seams).as_posix() for p in (seams / 'images').glob('*')}
    if len(seam_declared) != len(set(seam_declared)) or set(seam_declared) != seam_actual:
        errors.append('Seam study manifest must cover each selected image exactly once')
    for item in seam_data['images']:
        file = seams / item['file']
        if not file.is_file():
            errors.append(f'Seam study missing: {item["file"]}')
            continue
        raw = file.read_bytes()
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            errors.append(f'Seam study hash differs: {item["file"]}')
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) < 26:
            errors.append(f'Seam study invalid PNG: {item["file"]}')
        elif list(struct.unpack('>II', raw[16:24])) != item['dimensions'] or raw[25] != {'RGB': 2, 'RGBA': 6}.get(item['mode']):
            errors.append(f'Seam study dimensions/type differ: {item["file"]}')
        if item['file'] not in seam_gallery or item['prompt_key'] not in seam_prompts:
            errors.append(f'Seam study lacks gallery/prompt: {item["file"]}')
    for item in seam_data['source_inputs']:
        file = ROOT / item['project_file']
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Seam study source differs: {item["project_file"]}')
    config_hash = hashlib.sha256((seams / 'stage.json').read_bytes()).hexdigest()
    if config_hash != seam_data['packet']['config_sha256']:
        errors.append('Seam study configuration differs from the prepared packet')
    # The repair report is evidence, not an automatic visual acceptance certificate.
    report = json.loads((seams / 'verification.json').read_text(encoding='utf-8'))
    packet_hash = hashlib.sha256((json.dumps(seam_data['packet'], indent=2) + '\n').encode()).hexdigest()
    if report['packet_sha256'] != packet_hash or any(item['outside_repair_changed_pixels'] != 0 for item in report['layers']):
        errors.append('Seam study report does not match its packet/protected-pixel invariant')
    for repair in report['repairs']:
        candidate = seams / 'images' / (repair['job'] + '-candidate.png')
        if not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest() != repair['candidate_sha256']:
            errors.append(f'Seam repair report candidate differs: {repair["job"]}')
    viewer = (seams / 'viewer.html').read_text(encoding='utf-8')
    for target in re.findall(r'(?:src|href)="([^"]+)"', viewer):
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) and not (seams / target.split('#')[0]).exists():
            errors.append(f'Seam viewer missing target: {target}')

mutation = ROOT / 'references/production/campus-mutation'
if mutation.exists():
    data = json.loads((mutation / 'media-sources.json').read_text(encoding='utf-8'))
    viewer = (mutation / 'viewer.html').read_text(encoding='utf-8')
    declared = [item['file'] for item in data['images']]
    actual = {p.relative_to(mutation).as_posix() for folder in ('images', 'sources')
              for p in (mutation / folder).glob('*.png')}
    if len(declared) != len(set(declared)) or set(declared) != actual:
        errors.append('Creek replacement must declare every selected image exactly once')
    for item in data['images']:
        path = mutation / item['file']
        if not path.is_file():
            errors.append('Creek image missing: ' + item['file'])
            continue
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            errors.append('Creek image hash differs: ' + item['file'])
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) < 26:
            errors.append('Creek image is not PNG: ' + item['file'])
        elif list(struct.unpack('>II', raw[16:24])) != item['dimensions'] or raw[25] != {'RGB': 2, 'RGBA': 6}.get(item['mode']):
            errors.append('Creek image dimensions/type differ: ' + item['file'])
    for source in data['source_inputs']:
        path = ROOT / source['project_file']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
            errors.append('Creek fixed input changed: ' + source['project_file'])
    for layer in data['packet']['layers']:
        for source in layer['inputs']:
            path = ROOT / source['file']
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
                errors.append('Creek packet input changed: ' + source['file'])
    if hashlib.sha256((mutation / 'stage.json').read_bytes()).hexdigest() != data['packet']['config_sha256']:
        errors.append('Creek packet config changed')
    report = json.loads((mutation / 'repair-report.json').read_text(encoding='utf-8'))
    packet_hash = hashlib.sha256((json.dumps(data['packet'], indent=2) + '\n').encode()).hexdigest()
    if report['packet_sha256'] != packet_hash or any(x['outside_repair_changed_pixels'] for x in report['layers']):
        errors.append('Creek repair report protected-pixel evidence differs')
    for repair in report['repairs']:
        candidate = mutation / 'sources' / (repair['job'] + '-candidate.png')
        if hashlib.sha256(candidate.read_bytes()).hexdigest() != repair['candidate_sha256']:
            errors.append('Creek repair candidate changed: ' + repair['job'])
    for role in data['layer_order']:
        for chunk in ('left', 'center', 'right'):
            item = next((x for x in data['images'] if x['file'] == f'images/{role}-{chunk}.png'), None)
            if not item or item['dimensions'] != [2160, 720] or item['mode'] != 'RGBA':
                errors.append(f'Creek role/chunk missing or noncanonical: {role}/{chunk}')
    if len(data['layer_order']) != 7 or any(data['acceptance'].values()):
        errors.append('Creek must expose seven roles without claiming final approval')
    for target in re.findall(r'(?:src|href)="([^"]+)"', viewer):
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) and not (mutation / target.split('#')[0]).exists():
            errors.append('Creek viewer missing target: ' + target)

for diagram in (ROOT / 'docs/proposal/diagrams').glob('*.svg'):
    try:
        svg = ET.parse(diagram).getroot()
        if svg.tag != '{http://www.w3.org/2000/svg}svg' or any(
            not svg.findtext('{http://www.w3.org/2000/svg}' + tag)
            for tag in ('title', 'desc')
        ):
            errors.append(f'{diagram.relative_to(ROOT)}: missing SVG title/description')
    except ET.ParseError as exc:
        errors.append(f'{diagram.relative_to(ROOT)}: invalid SVG: {exc}')

for forbidden in ('CLAUDE.md',):
    if (ROOT / forbidden).exists():
        errors.append(f'Unexpected root file: {forbidden}')
if (ROOT / '.env').exists():
    tracked = subprocess.run(['git', 'ls-files', '--', '.env'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    ignored = subprocess.run(['git', 'check-ignore', '-q', '--', '.env'], cwd=ROOT).returncode == 0
    if tracked or not ignored:
        errors.append('Local .env must be ignored and untracked; never commit credentials')

from check_intake import verify as verify_intake
try:
    verify_intake()
except (AssertionError, KeyError, ValueError, OSError) as exc:
    errors.append('Reference/transcript intake verification failed: ' + str(exc))

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'Checked {len(markdown)} Markdown files, {len(expected_games)} games and {image_count} image signatures/provenance entries.')
if campus.exists():
    print('Checked eight collage hashes/prompts and reading-trail pages, 59 source-photo IDs and ten voice-note entries; no originals imported.')
if animation.exists():
    print(f'Checked {len(frames)} Playground frame hashes, signatures, source times and credits.')
if production.exists():
    print('Checked three scene-first trial hashes, PNG dimensions/type, prompts and source boards; this does not certify extraction quality or playability.')
if strip_study.exists():
    print(f'Checked {len(strip_images)} flat-strip images, source graph, native sizes/types, prompts, review origins and viewer paths; seams/recomposition remain unapproved.')
if seams.exists():
    print(f'Checked {len(seam_declared)} seam-study images, prompts/sources, configuration and protected-pixel report; visual approval remains separate.')
if mutation.exists():
    print('Checked the creek replacement inventory, 21 registered role/chunk exports, fixed inputs, packet/repair evidence and viewer paths; art/physics approval remains open.')
