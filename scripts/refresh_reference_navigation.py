"""Refresh the two-ended game and campus Markdown reading trails."""
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
START = '<!-- reference-navigation:start -->'
END = '<!-- reference-navigation:end -->'


def relative(source, target):
    return Path(os.path.relpath(ROOT / target, (ROOT / source).parent)).as_posix()


def navigation(pages, index, library='references/README.md'):
    page = pages[index]
    previous = pages[index - 1] if index else {'path': library, 'label': 'Visual library'}
    end = {'path': 'references/comparison.md', 'label': 'Compare the games'} if library == 'references/README.md' else {'path': library, 'label': 'Location library'}
    following = pages[index + 1] if index + 1 < len(pages) else end
    campus_trail = library == 'references/campus/README.md'
    context = (
        ('📍 Campus boards', 'references/campus/README.md'),
        ('🎮 Game studies', 'references/README.md'),
        ('🎨 Stage experiments', 'references/production/README.md'),
        ('Proposal', 'docs/proposal/campus-game.md'),
    )
    return (
        START + '\n'
        + f'[← Previous: {previous["label"]}]({relative(page["path"], previous["path"])})'
        + f' · [{"Campus index" if campus_trail else "Game index"}]({relative(page["path"], library)})'
        + f' · **{index + 1} / {len(pages)}**'
        + f' · [Next: {following["label"]} →]({relative(page["path"], following["path"])})\n\n'
        + ' · '.join(f'[{label}]({relative(page["path"], target)})' for label, target in context) + '\n'
        + END
    )


def main():
    count = 0
    for order, library in (
        ('references/reading-order.json', 'references/README.md'),
        ('references/campus/reading-order.json', 'references/campus/README.md'),
    ):
        pages = json.loads((ROOT / order).read_text(encoding='utf-8'))
        for index, page in enumerate(pages):
            path = ROOT / page['path']
            text = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\s*', '', path.read_text(encoding='utf-8'), flags=re.S)
            heading, _, body = text.partition('\n')
            nav = navigation(pages, index, library)
            path.write_text(heading + '\n\n' + nav + '\n\n' + body.strip() + '\n\n' + nav + '\n', encoding='utf-8', newline='\n')
        count += len(pages)
    print(f'Refreshed top and bottom navigation on {count} reference pages.')


if __name__ == '__main__':
    main()
