"""Offline checks for make_boards.py's UI additions: cropped references, the screen-hole mask, keyed crush."""
from pathlib import Path
import tempfile
import unittest

from PIL import Image

import make_boards as mb

MAGENTA = (255, 0, 255)


def case_with_hole() -> Image.Image:
    """A grey case on magenta with a magenta screen hole inside it."""
    image = Image.new('RGB', (60, 40), MAGENTA)
    image.paste((120, 120, 130), (10, 8, 50, 32))
    image.paste(MAGENTA, (16, 13, 44, 27))
    return image


class HoleMaskTests(unittest.TestCase):
    def test_only_enclosed_magenta_is_hole(self):
        hole = mb.hole_mask(case_with_hole())
        self.assertEqual(hole.getbbox(), (16, 13, 44, 27))
        self.assertEqual(hole.getpixel((0, 0)), 0)      # background magenta touches the border
        self.assertEqual(hole.getpixel((12, 10)), 0)    # the case itself
        self.assertEqual(hole.getpixel((30, 20)), 255)  # the screen

    def test_only_the_largest_enclosed_region_is_the_screen(self):
        image = case_with_hole()
        image.paste((120, 120, 130), (20, 0, 40, 8))  # a handle on top ...
        image.paste(MAGENTA, (24, 3, 36, 8))          # ... whose opening is enclosed by handle and case
        self.assertEqual(mb.hole_mask(image).getbbox(), (16, 13, 44, 27))

    def test_no_hole_without_enclosed_magenta(self):
        image = Image.new('RGB', (20, 20), MAGENTA)
        image.paste((0, 0, 0), (5, 5, 15, 15))
        self.assertIsNone(mb.hole_mask(image).getbbox())


class BoardPipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.saved = (mb.RAW, mb.OUT)
        mb.RAW, mb.OUT = self.base / 'raw', self.base / 'out'
        mb.RAW.mkdir()
        self.addCleanup(lambda: setattr(mb, 'RAW', self.saved[0]) or setattr(mb, 'OUT', self.saved[1]))

    def test_cropped_reference(self):
        source = self.base / 'raw' / 'wide.png'
        Image.new('RGB', (100, 50), (10, 20, 30)).save(source)
        out = mb.load_ref('out:wide@20,10,30,15', self.base)
        self.assertEqual(Image.open(out).size, (30, 15))

    def test_masked_board_keeps_only_the_hole(self):
        case_with_hole().save(mb.RAW / 'frame.png')
        painted = case_with_hole()
        painted.paste((10, 60, 30), (16, 13, 44, 27))  # what the model painted into the hole
        painted.save(mb.RAW / 'screen.png')
        mb.crush({'id': 'screen', 'factor': 2, 'edit': 'frame'})
        sprite = Image.open(mb.OUT / 'screen.png')
        self.assertEqual(sprite.size, (30, 20))
        self.assertEqual(sprite.getchannel('A').getbbox(), (8, 6, 22, 14))  # half-covered rows round to opaque

    def test_screen_colour_key(self):
        image = Image.new('RGB', (20, 20), (11, 36, 24))
        image.paste((60, 255, 110), (4, 4, 12, 12))
        image.save(mb.RAW / 'tiles.png')
        mb.crush({'id': 'tiles', 'factor': 2, 'key': '#0B2418'})
        self.assertEqual(Image.open(mb.OUT / 'tiles.png').getchannel('A').getbbox(), (2, 2, 6, 6))


if __name__ == '__main__':
    unittest.main()
