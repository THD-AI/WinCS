"""Offline checks for backdrop_check.py: key specks, soft pixels and enclosed holes are counted."""
import unittest

from PIL import Image

import backdrop_check as bc


class BackdropCheckTests(unittest.TestCase):
    def test_a_clean_hard_sprite_has_nothing(self):
        im = Image.new('RGBA', (10, 10), (0, 0, 0, 0))
        im.paste((40, 90, 160, 255), (2, 2, 8, 8))
        self.assertEqual(bc.findings(im, holes=True), {'key': 0, 'soft': 0, 'holes': 0})

    def test_key_specks_soft_edges_and_holes_are_counted(self):
        im = Image.new('RGBA', (10, 10), (0, 0, 0, 0))
        im.paste((40, 90, 160, 255), (1, 1, 9, 9))
        im.putpixel((4, 4), (0, 0, 0, 0))              # a hole inside
        im.putpixel((1, 1), (250, 10, 250, 255))       # a magenta speck
        im.putpixel((8, 8), (40, 90, 160, 128))        # a soft pixel
        self.assertEqual(bc.findings(im, holes=True), {'key': 1, 'soft': 1, 'holes': 1})

    def test_the_sheet_shows_purple_then_white(self):
        im = Image.new('RGBA', (4, 4), (0, 0, 0, 0))
        out = bc.sheet(im)
        self.assertEqual(out.getpixel((0, 0)), bc.PURPLE)
        self.assertEqual(out.getpixel((4 + 8, 0)), bc.WHITE)


if __name__ == '__main__':
    unittest.main()
