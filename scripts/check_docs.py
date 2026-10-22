"""Check authored documentation without a network or third-party dependencies."""
from pathlib import Path
import hashlib
import json
import re
import sys
from urllib.parse import unquote
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
    expected_boards = {'campus', 'hidden-gardens', 'creek', 'crossings', 'playground', 'toxic-garden', 'campus-robot'}
    if len(manifest['collages']) != 7 or {p.get('id', Path(p['file']).stem) for p in manifest['collages']} != expected_boards:
        errors.append('Campus collage manifest must retain seven separate location/item identities')
    prompts = json.loads((campus / 'prompts.json').read_text(encoding='utf-8'))['prompts']
    source_ids = {p['id'] for p in sources}
    for item in manifest['collages']:
        media = campus / item['file']
        if not media.is_file() or hashlib.sha256(media.read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Campus collage missing or changed: {item["file"]}')
        elif not media.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
            errors.append(f'Campus collage is not PNG: {item["file"]}')
        if item['prompt_key'] not in prompts or not set(item['source_ids']) <= source_ids:
            errors.append(f'Campus collage has invalid prompt/source mapping: {item["file"]}')
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

for forbidden in ('CLAUDE.md', '.env'):
    if (ROOT / forbidden).exists():
        errors.append(f'Unexpected root file: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'Checked {len(markdown)} Markdown files, {len(expected_games)} games and {image_count} image signatures/provenance entries.')
if campus.exists():
    print('Checked seven collage hashes/prompts, 59 source-photo IDs and ten voice-note entries; no originals imported.')
if animation.exists():
    print(f'Checked {len(frames)} Playground frame hashes, signatures, source times and credits.')
