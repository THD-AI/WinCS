"""Offline invariants for real layer repairs, including alpha and middle insertion."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import stage_art as art


class StageArtTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.order = ['left', 'center', 'right']
        self.layers = []
        for layer_id in ['ground', 'water']:
            files = {}
            for i, key in enumerate(self.order):
                file = self.root / f'{layer_id}-{key}.png'
                # Nonzero hidden RGB verifies that alpha-zero pixels are preserved too.
                Image.new('RGBA', (64, 32), (20+i*40, 30, 70, 0 if layer_id == 'water' else 255)).save(file)
                files[key] = file.name
            self.layers.append({'id': layer_id, 'role': layer_id, 'transparent': True, 'panels': files})
        self.config = self.root / 'stage.json'
        self.save_config()

    def save_config(self):
        self.config.write_text(json.dumps({'panel_size': [64, 32], 'chunks': self.order, 'layers': self.layers}), encoding='utf-8')

    def packet(self, name='packet'):
        path = self.root / name
        data = art.prepare(self.config, path, band=16, root=self.root)
        return path, data

    def candidates(self, packet):
        folder = self.root / 'candidates'
        folder.mkdir()
        for job in packet['jobs']:
            Image.new('RGBA', (64, 32), (220, 4, 18, 0)).save(folder/(job['id']+'.png'))
        return folder

    def test_staggered_context_and_mask_semantics(self):
        folder, packet = self.packet()
        self.assertEqual(len(packet['jobs']), 4)
        job = packet['jobs'][0]
        self.assertEqual(job['context_origin'], [32, 0])
        with Image.open(folder/job['id']/'context.png') as im:
            self.assertEqual(im.getpixel((0, 0)), (20, 30, 70, 255))
            self.assertEqual(im.getpixel((63, 0)), (60, 30, 70, 255))
        with Image.open(folder/job['id']/'edit-mask.png') as im:
            self.assertEqual(im.getpixel((0, 0))[3], 255)
            self.assertEqual(im.getpixel((32, 0))[3], 0)

    def test_replacement_deletes_old_alpha_and_locks_every_other_pixel(self):
        folder, packet = self.packet()
        candidates = self.candidates(packet)
        result = self.root/'result'
        report = art.apply(folder, candidates, result)
        self.assertFalse(report['visual_seams_approved'])
        for layer in packet['layers']:
            with Image.open(folder/layer['world']) as before, Image.open(result/(layer['id']+'-repaired.png')) as after:
                for x in range(192):
                    in_band = 56 <= x < 72 or 120 <= x < 136
                    for y in range(32):
                        self.assertEqual(after.getpixel((x,y)), (220,4,18,0) if in_band else before.getpixel((x,y)))

    def test_middle_insertion_reorders_all_layers_without_mutating_sources(self):
        original = {p.name:art.digest(p) for p in self.root.glob('*.png')}
        self.order.insert(1, 'inserted')
        for layer in self.layers:
            file = self.root/(layer['id']+'-inserted.png')
            Image.new('RGBA', (64,32), (1,2,3,255)).save(file)
            layer['panels']['inserted'] = file.name
        self.save_config()
        _, packet = self.packet()
        self.assertEqual(packet['world_size'], [256,32])
        self.assertEqual(packet['chunk_origins']['center'], [128,0])
        self.assertEqual(len(packet['jobs']), 6)
        for name, digest in original.items():
            self.assertEqual(art.digest(self.root/name), digest)

    def test_missing_layer_chunk_fails_before_writes(self):
        del self.layers[1]['panels']['center']
        self.save_config()
        with self.assertRaises(ValueError): self.packet()
        self.assertFalse((self.root/'packet').exists())

    def test_stale_mask_prompt_and_request_are_rejected(self):
        for name in ['edit-mask.png', 'prompt.txt', 'request.json']:
            folder, packet = self.packet(name.replace('.', '_'))
            with (folder/packet['jobs'][0]['id']/name).open('ab') as f: f.write(b'changed')
            with self.assertRaises(ValueError): art.load_packet(folder)

    def test_candidate_size_requires_explicit_small_normalization(self):
        file = self.root/'near.png'
        Image.new('RGBA',(65,32)).save(file)
        with self.assertRaises(ValueError): art.fitted(file,(64,32))
        self.assertEqual(art.fitted(file,(64,32),True).size, (64,32))
        with self.assertRaises(ValueError): art.fitted(file,(32,32),True)

    def test_no_partial_apply_when_candidate_missing(self):
        folder, packet = self.packet()
        candidates = self.candidates(packet)
        (candidates/(packet['jobs'][-1]['id']+'.png')).unlink()
        with self.assertRaises(FileNotFoundError): art.apply(folder,candidates,self.root/'result')
        self.assertFalse((self.root/'result').exists())

    def test_protect_existing_versions(self):
        folder, packet = self.packet()
        with self.assertRaises(ValueError): self.packet()
        candidates = self.candidates(packet)
        art.apply(folder,candidates,self.root/'result')
        with self.assertRaises(ValueError): art.apply(folder,candidates,self.root/'result')

    def test_submit_is_dry_by_default_and_preserves_requested_model(self):
        folder, packet = self.packet()
        cli = self.root/'image_gen.py'; cli.write_text('# fixture')
        with patch.object(art.subprocess,'run') as run:
            result = art.submit(folder,packet['jobs'][0]['id'],cli)
        args = run.call_args.args[0]
        self.assertIn('--dry-run', args)
        self.assertEqual(args[args.index('--model')+1], 'gpt-image-2.5-sunburst')
        self.assertFalse(result['executed'])

    def test_reject_escape_and_unsafe_ids(self):
        self.layers[0]['panels']['center'] = '../outside.png'
        self.save_config()
        with self.assertRaises(ValueError): self.packet()
        with self.assertRaises(ValueError): art.token('../invalid')


if __name__ == '__main__':
    unittest.main()
