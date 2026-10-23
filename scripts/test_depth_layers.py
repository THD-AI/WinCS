"""Offline checks for depth_layers.py: snapping the key, voting specks away, the sky edge, the masks it writes."""
from pathlib import Path
import tempfile
import unittest

from PIL import Image

import depth_layers as dl

SKY, FAR, REAR = dl.DEPTH["sky"][1], dl.DEPTH["far"][1], dl.DEPTH["rear"][1]


class DepthLayerTests(unittest.TestCase):
    def test_snap_takes_the_nearest_key_colour(self):
        key = Image.new("RGB", (3, 1))
        key.putdata([(10, 240, 250), (20, 10, 230), (250, 250, 30)])  # off-key cyan, blue, yellow
        self.assertEqual(dl.snap(key), ["sky", "far", "rear"])

    def test_vote_removes_a_speck(self):
        bands = ["sky"] * 81
        bands[40] = "far"  # one stray pixel in the middle of a 9x9 sky
        self.assertEqual(dl.vote(bands, (9, 9))[40], "sky")

    def test_refine_moves_a_sky_fringe_and_a_cut_treetop(self):
        # 6 wide, 4 tall: sky on top, far trees below. The key put a tree's top pixel in the sky (x=2, y=1)
        # and a blue sky pixel into the trees (x=4, y=2).
        art = Image.new("RGB", (6, 4), (70, 140, 230))
        for x in range(6):
            for y in (2, 3):
                art.putpixel((x, y), (90, 100, 80))
        art.putpixel((2, 1), (90, 100, 80))
        art.putpixel((4, 2), (70, 140, 230))
        bands = ["sky"] * 12 + ["far"] * 12
        out = dl.refine(bands, art, reach=2)
        self.assertEqual(out[1 * 6 + 2], "far")
        self.assertEqual(out[2 * 6 + 4], "sky")
        self.assertEqual(out[0], "sky")

    def test_hazy_treetops_are_not_sky(self):
        self.assertTrue(dl.skylike((50, 130, 240)))
        self.assertTrue(dl.skylike((240, 240, 235)))
        self.assertFalse(dl.skylike((80, 120, 180)))
        self.assertFalse(dl.skylike((100, 120, 140)))

    def test_refine_leaves_cloud_rims_in_the_sky(self):
        # A grey cloud rim far from any tree line stays sky.
        art = Image.new("RGB", (20, 20), (70, 140, 230))
        art.putpixel((10, 3), (150, 150, 150))
        bands = ["sky"] * 400
        self.assertEqual(dl.refine(bands, art)[3 * 20 + 10], "sky")

    def test_skyline_spans_every_column(self):
        # 8 wide, 5 tall: the layer shows at x=2 (top 1) and x=5 (top 3); everything else is hidden.
        own = [False] * 40
        own[1 * 8 + 2] = own[3 * 8 + 5] = True
        self.assertEqual(dl.skyline(own, 8, 5, smooth=0), [5, 5, 1, 1, 3, 3, 5, 5])  # no plate past the ends
        self.assertEqual(dl.skyline(own, 8, 5, smooth=1)[4], 1)

    def test_masks_are_written_for_the_parallax_bands_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            region = Path(tmp)
            bands = ["sky", "far", "mid", "rear", "play", "water"]
            written = dl.write_masks(region, "c-0-0", bands, (6, 1))
            self.assertEqual([p.name for p in written], ["c-0-0.00-sky.png", "c-0-0.01-far.png", "c-0-0.02-mid.png"])
            alpha = list(Image.open(written[1]).getchannel("A").getdata())
            self.assertEqual(alpha, [0, 255, 0, 0, 0, 0])


if __name__ == "__main__":
    unittest.main()
