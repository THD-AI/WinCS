"""Refresh the two-ended Markdown reading trail from references/reading-order.json."""
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
START = '<!-- reference-navigation:start -->'
END = '<!-- reference-navigation:end -->'


def relative(source, target):
    return Path(os.path.relpath(ROOT / target, (ROOT / source).parent)).as_posix()


def navigation(pages, index):
    page = pages[index]
    previous = pages[index - 1] if index else {'path': 'references/README.md', 'label': 'Visual library'}
    following = pages[index + 1] if index + 1 < len(pages) else {'path': 'references/comparison.md', 'label': 'Compare the games'}
    return (
        START + '\n'
        + f'[← Previous: {previous["label"]}]({relative(page["path"], previous["path"])})'
        + f' · [🖼️ Library]({relative(page["path"], "references/README.md")})'
        + f' · **{index + 1} / {len(pages)}**'
        + f' · [Next: {following["label"]} →]({relative(page["path"], following["path"])})\n'
        + END
    )


def main():
    pages = json.loads((ROOT / 'references/reading-order.json').read_text(encoding='utf-8'))
    for index, page in enumerate(pages):
        path = ROOT / page['path']
        text = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\s*', '', path.read_text(encoding='utf-8'), flags=re.S)
        heading, _, body = text.partition('\n')
        nav = navigation(pages, index)
        path.write_text(heading + '\n\n' + nav + '\n\n' + body.strip() + '\n\n' + nav + '\n', encoding='utf-8', newline='\n')
    print(f'Refreshed top and bottom navigation on {len(pages)} reference pages.')


if __name__ == '__main__':
    main()
