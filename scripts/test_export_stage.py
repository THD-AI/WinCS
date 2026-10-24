"""Offline checks for export_stage.py: manifest shape, shared plates, collision, exact rebuild."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

import export_stage as es

ROOT = Path(__file__).resolve().parents[1]


class ExportStageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.region = base / 'test-region'
        self.out = base / 'out'
        (self.region / 'images').mkdir(parents=True)
        for name, colour in (('left', (200, 60, 40, 255)), ('right', (40, 60, 200, 255))):
            Image.new('RGBA', (40, 20), (90, 140, 200, 255)).save(self.region / 'images' / f'sky-{name}.png')
            front = Image.new('RGBA', (40, 20), (0, 0, 0, 0))
            front.paste(colour, (10, 10, 30, 20))
            front.save(self.region / 'images' / f'front-{name}.png')
            composed = Image.new('RGBA', (40, 20), (90, 140, 200, 255))
            composed.alpha_composite(front)
            composed.convert('RGB').save(self.region / 'images' / f'all-{name}.png')
        (self.region / 'images' / 'sky-right.png').unlink()  # the right chunk reuses the left sky
        (self.region / 'media-sources.json').write_text(json.dumps({'aliases': {'sky-right.png': 'sky-left.png'}}))
        (self.region / 't-0-0.clean.collision.json').write_text('{"chunk": "t-0-0"}')
        self.config = {
            'chunkSize': [40, 20],
            'chunks': {'t-0-0': {'x': 0, 'y': 0, 'name': 'left'}, 't-1-0': {'x': 1, 'y': 0, 'name': 'right'}},
            'layers': {'sky': {'file': 'images/sky-{name}.png', 'z': 0, 'scroll': 0.1},
                       'front': {'file': 'images/front-{name}.png', 'z': 5, 'scroll': 1.0}},
            'states': {'clean': ['sky', 'front']},
            'composed': {'clean': 'images/all-{name}.png'},
            'aliases': 'media-sources.json'}
        self.save()

    def save(self):
        (self.region / 'export.json').write_text(json.dumps(self.config), encoding='utf-8')

    def test_manifest_lists_chunks_layers_and_collision(self):
        stage = es.export(self.region, self.out)
        self.assertEqual([c['id'] for c in stage['chunks']], ['t-0-0', 't-1-0'])
        left = stage['chunks'][0]['states']['clean']
        self.assertEqual([(l['id'], l['z'], l['scroll']) for l in left['layers']], [('sky', 0, 0.1), ('front', 5, 1.0)])
        self.assertEqual(left['collision'], 't-0-0.clean.collision.json')
        self.assertIsNone(stage['chunks'][1]['states']['clean']['collision'])
        written = json.loads((self.out / 'test-region' / 'stage.json').read_text())
        self.assertEqual(written['chunks'], stage['chunks'])

    def test_shared_plates_are_copied_once(self):
        stage = es.export(self.region, self.out)
        skies = {c['states']['clean']['layers'][0]['file'] for c in stage['chunks']}
        self.assertEqual(skies, {'sky-left.png'})
        names = sorted(p.name for p in (self.out / 'test-region').iterdir())
        self.assertEqual(names, ['front-left.png', 'front-right.png', 'sky-left.png', 'stage.json',
                                 't-0-0.clean.collision.json'])

    def test_region_data_files_are_published_and_checked(self):
        (self.region / 'atmosphere.json').write_text('{"wind": {"base": 0.5}}', encoding='utf-8')
        es.export(self.region, self.out)
        published = json.loads((self.out / 'test-region' / 'atmosphere.json').read_text(encoding='utf-8'))
        self.assertEqual(published, {'wind': {'base': 0.5}})
        self.assertFalse((self.out / 'test-region' / 'surfaces.json').exists())
        Image.new('RGBA', (4, 4)).save(self.region / 'wrong.png')
        (self.region / 'atmosphere.json').write_text('{"assets": ["wrong.png"]}', encoding='utf-8')
        es.export(self.region, self.out)
        self.assertTrue((self.out / 'test-region' / 'wrong.png').exists())
        (self.region / 'atmosphere.json').write_text('{"assets": ["../escape.png"]}', encoding='utf-8')
        with self.assertRaisesRegex(es.ExportError, 'not a file in the region'):
            es.export(self.region, self.out)
        (self.region / 'atmosphere.json').write_text('{"wind": ', encoding='utf-8')
        with self.assertRaisesRegex(es.ExportError, 'atmosphere.json is not valid JSON'):
            es.export(self.region, self.out)

    def test_verify_rebuilds_and_catches_a_wrong_order(self):
        es.export(self.region, self.out)
        self.assertEqual(es.verify(self.region, self.out), ['t-0-0.clean', 't-1-0.clean'])
        self.config['states']['clean'] = ['front', 'sky']  # the opaque sky now covers the front
        self.save()
        es.export(self.region, self.out)
        with self.assertRaisesRegex(es.ExportError, "don't rebuild images/all-left.png"):
            es.verify(self.region, self.out)

    def test_bad_config_is_named(self):
        self.config['states']['clean'].append('fog')
        self.save()
        with self.assertRaisesRegex(es.ExportError, "unknown layer 'fog'"):
            es.export(self.region, self.out)
        self.config['states']['clean'].pop()
        self.config['layers']['front']['file'] = 'images/missing-{name}.png'
        self.save()
        with self.assertRaisesRegex(es.ExportError, 'missing-left.png does not exist'):
            es.export(self.region, self.out)

    def test_committed_regions_rebuild_exactly(self):
        for config in sorted((ROOT / 'art' / 'stages').glob('*/export.json')):
            with self.subTest(region=config.parent.name):
                es.export(config.parent, self.out)
                self.assertTrue(es.verify(config.parent, self.out))


if __name__ == '__main__':
    unittest.main()
