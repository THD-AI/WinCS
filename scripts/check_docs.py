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
    if not first_image or first_image.start() > 1600:
        errors.append(f'{page["path"]}: missing early visual preview')

games = ROOT / 'references' / 'games'
expected_games = {
    'hollow-knight', '9-years-of-shadows', 'metroid-dread', 'apple-knight',
    'animal-well', 'soul-knight', 'drova-forsaken-kin', 'kingdom-two-crowns',
    'kingdom-eighties', 'stardew-valley', 'children-of-morta', 'planet-of-lana',
    'dead-cells',
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

for forbidden in ('CLAUDE.md', '.env'):
    if (ROOT / forbidden).exists():
        errors.append(f'Unexpected root file: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'Checked {len(markdown)} Markdown files, {len(expected_games)} games and {image_count} image signatures/provenance entries.')
