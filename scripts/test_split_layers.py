"""Offline checks for split_layers.py: exact recomposition, shared layers, --check, and Rusty Creek."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageChops, ImageDraw

import split_layers as sl

ROOT = Path(__file__).resolve().parents[1]
CREEK = ROOT / 'art' / 'stages' / 'rusty-creek'


def scene(anomaly=False):
    """A 120x60 chunk: sky, a far hill, a green platform, water; the anomaly recolours the platform."""
    image = Image.new('RGBA', (120, 60), (120, 180, 230, 255))
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 30), (40, 18), (80, 30)], fill=(90, 110, 120, 255))
    draw.rectangle((20, 34, 99, 39), fill=(170, 60, 40, 255) if anomaly else (60, 160, 70, 255))
    draw.rectangle((0, 48, 119, 59), fill=(40, 80, 140, 255))
    return image


class SplitLayersTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.region = Path(self.tmp.name)
        scene().save(self.region / 'clean.png')
        scene(anomaly=True).save(self.region / 'anomaly.png')
        self.config = {'chunks': {'t-0-0': {
            'states': {'clean': 'clean.png', 'anomaly': 'anomaly.png'},
            'default': '00-sky',
            'rules': [
                {'layer': '01-far', 'poly': [[0, 30], [40, 18], [80, 30]]},
                {'layer': '05-play', 'rect': [20, 34, 100, 40]},
                {'layer': '04-water', 'rect': [0, 48, 120, 60]},
            ]}}}
        self.save()

    def save(self):
        (self.region / 'layers.json').write_text(json.dumps(self.config), encoding='utf-8')

    def test_split_is_exact_and_shares_unchanged_layers(self):
        report = sl.run(self.region, check=False)
        names = sorted(p.name for p in (self.region / 'layers').glob('*.png'))
        self.assertEqual(names, ['t-0-0.00-sky.png', 't-0-0.01-far.png', 't-0-0.04-water.png',
                                 't-0-0.anomaly.05-play.png', 't-0-0.clean.05-play.png'])
        self.assertIn('3 shared by all states', report[0])
        self.assertTrue(sl.run(self.region, check=True)[0].endswith('rebuild clean, anomaly exactly'))

    def test_layers_never_overlap(self):
        source = scene()
        layers = sl.split(source, sl.assign(self.config['chunks']['t-0-0'], 'clean', source, self.region))
        seen = Image.new('L', source.size, 0)
        for layer in layers.values():
            alpha = layer.getchannel('A').point(lambda a: 1 if a else 0)
            seen = ImageChops.add(seen, alpha)
        self.assertEqual(seen.getextrema(), (1, 1))

    def test_check_catches_a_stale_layer(self):
        sl.run(self.region, check=False)
        scene(anomaly=True).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(self.region / 'anomaly.png')
        with self.assertRaisesRegex(sl.SplitError, 'no longer rebuild anomaly.png'):
            sl.run(self.region, check=True)

    def test_state_only_rules_and_colour_rules(self):
        self.config['chunks']['t-0-0']['rules'].append(
            {'layer': '06-near', 'colour': [170, 60, 40], 'tolerance': 5, 'states': ['anomaly']})
        self.save()
        sl.run(self.region, check=False)
        names = {p.name for p in (self.region / 'layers').glob('*.png')}
        self.assertIn('t-0-0.anomaly.06-near.png', names)
        self.assertNotIn('t-0-0.anomaly.05-play.png', names)  # the recoloured platform moved to 06
        self.assertIn('t-0-0.clean.05-play.png', names)

    def test_bad_config_is_named(self):
        self.config['chunks']['t-0-0']['rules'].append({'layer': '09-fx', 'rect': [0, 0, 1, 1]})
        self.save()
        with self.assertRaisesRegex(sl.SplitError, "unknown layer '09-fx'"):
            sl.run(self.region, check=False)

    def test_rusty_creek_matches_creek_layers(self):
        """Split the composed left anomaly chunk with the creek's own layer alphas, in its draw order.
        Every pixel lands in the layer creek_layers.py drew on top there, and the stack rebuilds the art.
        (Colours can't match the plates: they are semi-transparent, so the composed art is a blend.)"""
        assembly = json.loads((CREEK / 'assembly.json').read_text(encoding='utf-8'))
        role_to_layer = {'01-distance': '01-far', '03-bank': '02-mid', '02-supports': '03-rear',
                         '04-water': '04-water', '05-traversal': '05-play', '06-near-rails': '06-near',
                         '07-foliage': '07-foreground'}
        order = assembly['draw_order']
        plates = {r: Image.open(CREEK / 'images' / f'{r}-left.png').convert('RGBA') for r in order}
        rules = [{'layer': role_to_layer[r], 'alpha': f'images/{r}-left.png'} for r in order]
        source = Image.open(CREEK / 'images' / 'after-left.png').convert('RGBA')
        layers = sl.split(source, sl.assign({'default': '01-far', 'rules': rules}, 'anomaly', source, CREEK))
        self.assertTrue(sl.same(sl.stack(layers, source.size), source))
        covered = Image.new('L', source.size, 0)  # pixels a later-drawn plate already claims
        for role in reversed(order):
            drawn = plates[role].getchannel('A').point(lambda a: 255 if a else 0)
            on_top = ImageChops.subtract(drawn, covered)
            ours = layers.get(role_to_layer[role])
            ours = ours.getchannel('A').point(lambda a: 255 if a else 0) if ours else Image.new('L', source.size, 0)
            self.assertIsNone(ImageChops.difference(ours, on_top).getbbox(), role)
            covered = ImageChops.lighter(covered, drawn)

if __name__ == '__main__':
    unittest.main()
