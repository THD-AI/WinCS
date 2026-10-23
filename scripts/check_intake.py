"""Verify committed collage coverage and complete readable API transcripts."""
from pathlib import Path
import hashlib
import json
import re
import struct
from html.parser import HTMLParser
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify():
    boards = ROOT / 'references/campus-objects'
    photos = json.loads((boards / 'source-index.json').read_text(encoding='utf-8'))['photos']
    media = json.loads((boards / 'media-sources.json').read_text(encoding='utf-8'))
    prompts = json.loads((boards / 'prompts.json').read_text(encoding='utf-8'))['prompts']
    assert len(photos) == 67 and {p['id'] for p in photos} == {f'N{i:02}' for i in range(1, 68)}
    assert len({p['filename'] for p in photos}) == 67
    assert all(re.fullmatch(r'[a-f0-9]{64}', p['sha256']) for p in photos)
    assert len(media['outputs']) == 8 and media['raw_images_committed'] is False
    coverage = []
    declared = set()
    for board in media['outputs']:
        path = boards / board['file']; raw = path.read_bytes()
        assert raw.startswith(b'\x89PNG\r\n\x1a\n') and sha(raw) == board['sha256'], path
        assert struct.unpack('>II', raw[16:24]) == (board['width'], board['height']), path
        assert board['prompt_key'] in prompts and (boards / board['page']).is_file()
        page = (boards / board['page']).read_text(encoding='utf-8')
        assert page.count('[← Previous]') == 2 and page.count('[Next →]') == 2, path
        assert set(board['source_ids']) == {p['id'] for p in photos if p['board'] == board['id']}
        declared.add(board['file']); coverage.extend(board['source_ids'])
    assert len(coverage) == 67 and set(coverage) == {p['id'] for p in photos}
    assert declared == {p.relative_to(boards).as_posix() for p in (boards / 'images').iterdir()}
    transcripts = ROOT / 'docs/brief/transcripts'
    index = json.loads((transcripts / 'source-index.json').read_text(encoding='utf-8'))
    assert [r['id'] for r in index['recordings']] == [f'A{i:02}' for i in range(1, 14)]
    for record in index['recordings']:
        path = transcripts / record['file']; raw = path.read_bytes(); text = raw.decode('utf-8')
        assert not any(marker in text for marker in ('â€', 'Ã¢', '\ufffd')), path
        assert sha(raw) == record['file_sha256'], path
        assert record['method'] == 'OpenAI Audio Transcriptions API' and record['requested_model'] == 'gpt-transcribe'
        assert record['summary'] in text and '## Transcript' in text, path
        body = text.split('\n## Transcript\n\n', 1)[1].rsplit('\n\n', 1)[0]
        anchors = re.findall(r'<a id="(p\d+)"></a>', body)
        assert anchors == [f'p{i:03}' for i in range(1, record['paragraph_count'] + 1)], path
        words = re.sub(r'<a id="p\d+"></a>', '', body)
        assert sha(' '.join(words.split()).encode()) == record['normalized_transcript_sha256'], path
    old = json.loads((ROOT / 'docs/brief/voice-source-index.json').read_text(encoding='utf-8'))
    assert [r['sha256'] for r in old['recordings']] == [r['source_sha256'] for r in index['recordings'][:10]]

    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for name, value in attrs:
                if name in ('src', 'href') and value and not re.match(r'^(?:[a-z]+:|#)', value):
                    assert (boards / unquote(value.split('#')[0])).exists(), value
    Links().feed((boards / 'viewer.html').read_text(encoding='utf-8'))
    print('Checked 8 collage files, 67 unique photo IDs, 13 complete API transcripts/summaries, source-word hashes and viewer links.')


if __name__ == '__main__':
    verify()
