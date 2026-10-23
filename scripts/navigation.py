"""Write Previous / Index / Next links at the top and bottom of every Markdown trail.

Each trail is an ordered list of pages plus the index page they belong to.
Run after adding, removing or reordering a page:  python scripts/navigation.py
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START, END = '<!-- nav:start -->', '<!-- nav:end -->'
LEGACY = re.compile(r'<!-- reference-navigation:start -->.*?<!-- reference-navigation:end -->\s*', re.S)
BLOCK = re.compile(re.escape(START) + r'.*?' + re.escape(END) + r'\s*', re.S)
# Old hand-written "[← Previous](...) · ..." lines at either end of a page.
OLD_LINE = re.compile(r'^\[← [^\n]*\]\([^\n]*\n', re.M)


def title(path: Path) -> str:
    first = path.read_text(encoding='utf-8').split('\n', 1)[0]
    return re.sub(r'^#\s*', '', first).strip()


def pages_from_json(order: str) -> list[str]:
    return [p['path'] for p in json.loads((ROOT / order).read_text(encoding='utf-8'))]


def board_pages(config: str) -> list[str]:
    folder = (ROOT / config).parent
    boards = json.loads((ROOT / config).read_text(encoding='utf-8'))['boards']
    return [(folder / f"{b['id']}.md").relative_to(ROOT).as_posix() for b in boards
            if (folder / f"{b['id']}.md").exists()]


def trails() -> list[tuple[str, str, list[str]]]:
    docs = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs').glob('[0-9][0-9]-*.md'))
    transcripts = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs/meetings/transcripts').glob('A*.md'))
    return [
        ('Design docs', 'docs/README.md', docs + ['docs/meetings/README.md']),
        ('Transcripts', 'docs/meetings/transcripts/README.md', transcripts),
        ('Visual direction', 'art/direction/README.md', board_pages('art/direction/direction.json')),
        ('Stage concepts', 'art/locations/README.md', board_pages('art/locations/locations.json')),
        ('Sprite boards', 'art/sprites/README.md', board_pages('art/sprites/boards.json')),
        ('Game references', 'references/README.md', pages_from_json('references/reading-order.json')),
        ('Campus collages', 'references/campus/README.md', pages_from_json('references/campus/reading-order.json')),
    ]


def link(source: str, target: str) -> str:
    return Path(os.path.relpath(ROOT / target, (ROOT / source).parent)).as_posix()


def nav(name: str, index: str, pages: list[str], i: int) -> str:
    here = pages[i]
    prev = pages[i - 1] if i else index
    nxt = pages[i + 1] if i + 1 < len(pages) else index
    return (f'{START}\n[← {title(ROOT / prev)}]({link(here, prev)}) · '
            f'[{name}]({link(here, index)}) · **{i + 1} / {len(pages)}** · '
            f'[{title(ROOT / nxt)} →]({link(here, nxt)})\n{END}')


def strip(text: str) -> str:
    text = BLOCK.sub('', LEGACY.sub('', text))
    heading, _, body = text.partition('\n')
    body = body.strip('\n')
    # Drop legacy nav lines only where they sit: the first and last lines of the body.
    lines = body.split('\n')
    while lines and OLD_LINE.match(lines[0] + '\n'):
        lines = lines[1:]
        while lines and not lines[0].strip():
            lines = lines[1:]
    while lines and OLD_LINE.match(lines[-1] + '\n'):
        lines = lines[:-1]
        while lines and not lines[-1].strip():
            lines = lines[:-1]
    return heading, '\n'.join(lines)


def main() -> None:
    count = 0
    for name, index, pages in trails():
        for i, page in enumerate(pages):
            path = ROOT / page
            heading, body = strip(path.read_text(encoding='utf-8'))
            block = nav(name, index, pages, i)
            path.write_text(f'{heading}\n\n{block}\n\n{body}\n\n{block}\n', encoding='utf-8', newline='\n')
            count += 1
    print(f'Navigation written on {count} pages.')


if __name__ == '__main__':
    main()
