"""Offline checks for compare.py: crops, stacked comparisons, and the lineup's measured vs documented heights."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

import compare as cp


class CompareTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.saved = (cp.ROOT, cp.SPRITES)
        cp.ROOT, cp.SPRITES = self.base, self.base
        self.addCleanup(lambda: (setattr(cp, 'ROOT', self.saved[0]), setattr(cp, 'SPRITES', self.saved[1])))

    def test_images_crop_scale_and_stack(self):
        Image.new('RGB', (200, 100), (10, 10, 10)).save(self.base / 'ref.png')
        Image.new('RGB', (100, 50), (200, 200, 200)).save(self.base / 'ours.png')
        out = cp.images('ref.png@0,0,100,50', 'ours.png', width=400, step=40)
        self.assertEqual(out.size, (400, 200 + 200 + 8))  # both 2:1 at 400 wide, 8 px gap

    def test_lineup_reports_against_documented_heights(self):
        sheet = Image.new('RGBA', (60, 80))
        sheet.paste((40, 90, 160, 255), (2, 4, 22, 80))    # hero idle: 20x76
        sheet.paste((40, 90, 160, 255), (30, 60, 50, 78))  # drone: 20x18 – a span of 20, not 45
        frames = {'idle-00': {'frame': {'x': 0, 'y': 0, 'w': 26, 'h': 80}},
                  'hover-00': {'frame': {'x': 28, 'y': 58, 'w': 30, 'h': 22}}}
        for atlas, name in (('hero-move', 'idle-00'), ('enemy-drone', 'hover-00')):
            sheet.save(self.base / f'{atlas}.png')
            (self.base / f'{atlas}.json').write_text(json.dumps({'frames': {name: frames[name]}}), encoding='utf-8')
        _, report = cp.lineup(['hero-move:idle-00', 'enemy-drone:hover-00'])
        self.assertIn('hero-move:idle-00: 20x76 px, documented 76 px (+0 %)', report)
        self.assertIn('enemy-drone:hover-00: 20x18 px, documented 45 px (-56 %)', report)

    def test_lineup_scales_a_frame_and_its_documented_height(self):
        sheet = Image.new('RGBA', (20, 31))
        sheet.paste((40, 90, 160, 255), (2, 4, 12, 31))  # dexter: 10x27, the documented plush
        sheet.save(self.base / 'dexter.png')
        (self.base / 'dexter.json').write_text(json.dumps({'frames': {'idle-00': {'frame': {'x': 0, 'y': 0, 'w': 20, 'h': 31}}}}), encoding='utf-8')
        _, report = cp.lineup(['dexter:idle-00*1.6'])
        self.assertIn('dexter:idle-00*1.6: 16x43 px, documented 43 px (+0 %)', report)

    def test_stride_is_twice_the_widest_spread_between_planted_feet(self):
        # Two frames, 40x20 each: double support with feet 21 px apart, then one foot passing.
        sheet = Image.new('RGBA', (80, 20))
        sheet.paste((40, 90, 160, 255), (2, 17, 10, 20))   # back foot, centre 5.5
        sheet.paste((40, 90, 160, 255), (23, 17, 31, 20))  # front foot, centre 26.5
        sheet.paste((40, 90, 160, 255), (52, 17, 60, 20))  # one foot
        sheet.paste((40, 90, 160, 255), (50, 0, 62, 17))   # the body above it
        sheet.save(self.base / 'hero-move.png')
        frames = {'walk-00': {'frame': {'x': 0, 'y': 0, 'w': 40, 'h': 20}},
                  'walk-01': {'frame': {'x': 40, 'y': 0, 'w': 40, 'h': 20}}}
        (self.base / 'hero-move.json').write_text(json.dumps({'frames': frames}), encoding='utf-8')
        (self.base / 'hero-move.anims.json').write_text(json.dumps({'walk': {'frames': 2, 'fps': 12, 'loop': True}}), encoding='utf-8')
        step, length, report = cp.stride('hero-move', 'walk')
        self.assertEqual((step, length), (21.0, 42.0))
        self.assertIn('-> 252 px/s at 12 fps', report[-1])  # 42 px per 2-frame cycle at 12 fps

    def test_unknown_frame_stops(self):
        Image.new('RGBA', (10, 10)).save(self.base / 'fx.png')
        (self.base / 'fx.json').write_text(json.dumps({'frames': {}}), encoding='utf-8')
        with self.assertRaises(SystemExit):
            cp.frame('fx', 'missing-00')


if __name__ == '__main__':
    unittest.main()
