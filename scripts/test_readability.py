"""Offline checks for readability.py and export_key_art.py: contrast numbers, the sheet, key-art export."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

import export_key_art as ka
import readability as rd


class ReadabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)

    def atlas(self, name, colour):
        sheet = Image.new('RGBA', (20, 20))
        sheet.paste(colour, (5, 2, 15, 20))
        sheet.save(self.base / f'{name}.png')
        frames = {'idle-00': {'frame': {'x': 0, 'y': 0, 'w': 20, 'h': 20}}}
        (self.base / f'{name}.json').write_text(json.dumps({'frames': frames}), encoding='utf-8')

    def test_contrast_dark_on_light_is_high_same_colour_is_low(self):
        sprite = Image.new('RGBA', (4, 4), (0, 0, 0, 0))
        sprite.paste((20, 20, 20, 255), (1, 0, 3, 4))
        light = Image.new('RGB', (4, 4), (220, 220, 220))
        fill, rim = rd.contrast(sprite, light)
        self.assertGreater(fill, 150)
        self.assertGreater(rim, 150)
        same = Image.new('RGB', (4, 4), (20, 20, 20))
        self.assertEqual(rd.contrast(sprite, same), (0.0, 0.0))

    def test_rim_outlines_the_silhouette_only(self):
        piece = Image.new('RGBA', (3, 3))
        piece.putpixel((1, 1), (0, 0, 0, 255))
        out = rd.rim(piece, (255, 255, 255, 255))
        self.assertEqual(out.size, (5, 5))
        self.assertEqual(out.getpixel((2, 2)), (0, 0, 0, 255))
        self.assertEqual(out.getpixel((2, 1)), (255, 255, 255, 255))
        self.assertEqual(out.getpixel((1, 1))[3], 0)  # diagonal stays clear

    def test_sheet_reports_sizes_flags_low_and_missing(self):
        self.atlas('dark', (10, 10, 10, 255))
        bg = Image.open(rd.GARDEN / 'hg-0-0.png').convert('RGB').crop(rd.BANDS['path'][1])
        ground = rd.BANDS['path'][2]
        # A sprite painted in the background's own colour right where it will stand is unreadable.
        self.atlas('melt', bg.getpixel((20, ground - 5)) + (255,))
        out, report = rd.sheet(['dark:idle-00', 'nothere:idle-00'], [self.base])
        self.assertTrue(any(r.startswith('dark:idle-00 @path: 10x18 px') for r in report))
        self.assertTrue(any(r.startswith('nothere:idle-00: MISSING') for r in report))
        self.assertLess(out.width, bg.width * 3)  # cut to the sprites' width

    def test_key_art_exports_opaque_16_9_and_refuses_small(self):
        Image.new('RGBA', (1280, 720), (30, 60, 90, 255)).save(self.base / 'menu.png')
        target = ka.export('menu', source=self.base, out=self.base / 'ui')
        self.assertEqual(Image.open(target).mode, 'RGB')
        self.assertEqual(Image.open(target).size, (1280, 720))
        Image.new('RGBA', (640, 360)).save(self.base / 'tiny.png')
        with self.assertRaises(SystemExit):
            ka.export('tiny', source=self.base, out=self.base / 'ui')


if __name__ == '__main__':
    unittest.main()
