"""Check the repository's documents and committed art. No network, no third-party packages.

- every local Markdown link and image resolves
- every page in a navigation trail carries its Previous / Next block at both ends
- no HTML viewers in docs/, art/ or references/
- no byte-identical tracked files, no tracked file over 6 MB
- every committed board image belongs to a board in its config
- no photos, audio or keys tracked anywhere
- no double-encoded text (UTF-8 read as Windows-1252 and saved again, so an en dash or a check mark turns into
  two or three Latin-1 letters)
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from navigation import END, START, trails  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 6 * 1024 * 1024
errors: list[str] = []

tracked = [ROOT / p for p in subprocess.run(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT,
    capture_output=True, check=True).stdout.decode().split('\0') if p]
tracked = [p for p in tracked if p.exists()]

# UTF-8 bytes read as Windows-1252 and written back as UTF-8: the lead bytes of "–", "“", "✅", "🟨", "ä" turn
# into these pairs. A script that reads git's output in the console's code page does it to a whole file.
_PAIRS = ((0xE2, 0x20AC), (0xE2, 0x153), (0xF0, 0x178))  # the pairs, by code point, so this file stays clean
_AFTER_C3 = (0xA4, 0xB6, 0xBC, 0x178, 0x2013, 0x153, 0xA9)
MOJIBAKE = re.compile('|'.join(''.join(map(chr, pair)) for pair in _PAIRS) + '|' + chr(0xC3) + '[' + ''.join(map(chr, _AFTER_C3)) + ']')
for path in (p for p in tracked if p.suffix in ('.md', '.json', '.ts', '.py', '.csv')):
    found = MOJIBAKE.search(path.read_text(encoding='utf-8-sig', errors='replace'))
    if found:
        errors.append(f'{path.relative_to(ROOT)}: double-encoded text ({found.group(0)!r}), re-save it from the UTF-8 source')

for path in (p for p in tracked if p.suffix == '.md'):
    text = path.read_text(encoding='utf-8-sig')
    for target in re.findall(r'\]\(([^)\s]+)', text):
        target = target.strip('<>')
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        relative = unquote(target.split('#', 1)[0])
        if relative and not (path.parent / relative).exists():
            errors.append(f'{path.relative_to(ROOT)}: missing link target {target}')

for name, index, pages in trails():
    if not (ROOT / index).exists():
        errors.append(f'{name}: missing index {index}')
    for page in pages:
        text = (ROOT / page).read_text(encoding='utf-8')
        if text.count(START) != 2 or text.count(END) != 2:
            errors.append(f'{page}: run python scripts/navigation.py (navigation missing)')

for path in tracked:
    rel = path.relative_to(ROOT).as_posix()
    if path.suffix in {'.html', '.htm'} and rel.split('/')[0] in {'docs', 'art', 'references'}:
        errors.append(f'{rel}: HTML viewers are not allowed; use Markdown pages')
    if path.suffix.lower() in {'.jpg', '.jpeg', '.heic', '.m4a', '.ogg', '.opus', '.mp3', '.wav'} \
            and not rel.startswith('references/'):
        errors.append(f'{rel}: photos and audio stay outside Git')
    if path.name == '.env' or path.name.startswith('.env.') and path.name != '.env.example':
        errors.append(f'{rel}: keys must never be committed')
    if path.stat().st_size > MAX_BYTES:
        errors.append(f'{rel}: {path.stat().st_size // 1024} KB is over the 6 MB limit')

seen: dict[str, str] = {}
for path in tracked:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    rel = path.relative_to(ROOT).as_posix()
    if path.stat().st_size > 1024 and digest in seen:
        errors.append(f'{rel}: duplicate of {seen[digest]}')
    seen.setdefault(digest, rel)

for config in ('art/sprites/boards.json', 'art/direction/direction.json', 'art/locations/locations.json'):
    data = json.loads((ROOT / config).read_text(encoding='utf-8'))
    ids = {b['id'] for b in data['boards']}
    for image in (ROOT / config).parent.glob('images/*.png'):
        board = image.stem.removesuffix('-preview')
        if board not in ids:
            errors.append(f'{image.relative_to(ROOT)}: no board "{board}" in {config}')

if errors:
    print('\n'.join(errors))
    sys.exit(f'{len(errors)} problem(s).')
print(f'Checked {len(tracked)} files: links, navigation, no HTML, no photos/audio/keys, no duplicates, board images.')
