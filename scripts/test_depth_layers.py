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

    def test_walk_lines_turn_a_small_step_into_a_ramp_and_split_at_a_cliff(self):
        # 90 wide, 80 tall: floor y=60 for x<30, a 10 px step up to y=50 until x=60, a 30 px cliff up to y=20.
        w, h = 90, 80
        bands = ["sky"] * (w * h)
        for x in range(w):
            top = 60 if x < 30 else 50 if x < 60 else 20
            for y in range(top, h):
                bands[y * w + x] = "play"
        lines = dl.walk_lines(bands, w, h, step=12, shortest=10)
        self.assertEqual(len(lines), 2)
        first = lines[0]
        self.assertEqual((first[0], first[-1]), ([0, 60], [60, 50]))
        self.assertEqual(first, [[0, 60], [23, 60], [36, 50], [60, 50]])  # the step became a ramp, ~38°
        self.assertEqual(lines[1], [[60, 20], [90, 20]])

    def test_walk_lines_find_a_hollow_under_the_path(self):
        # The path at y=10 across, and a hollow floor at y=30 under x=20..40 (sky between).
        w, h = 60, 40
        bands = ["play"] * (w * h)
        for x in range(w):
            for y in range(10):
                bands[y * w + x] = "sky"
        for x in range(20, 40):
            for y in range(20, 30):
                bands[y * w + x] = "rear"
        self.assertEqual(dl.walk_lines(bands, w, h, step=5, shortest=10), [[[0, 10], [60, 10]]])  # top only
        lines = dl.walk_lines(bands, w, h, step=5, shortest=10, every=True)
        self.assertIn([[0, 10], [60, 10]], lines)
        self.assertIn([[20, 30], [40, 30]], lines)

    def test_rdp_keeps_corners_only(self):
        pts = [(x, 10) for x in range(10)] + [(10 + x, 10 - x) for x in range(10)]
        self.assertEqual(dl.rdp(pts, 1.0), [(0, 10), (10, 10), (19, 1)])

    def test_region_plate_places_each_chunk_at_its_scroll_offset(self):
        # Two 100x4 plates at scroll 0.5: the strip is 150 wide, the second plate starts at 50.
        a = Image.new("RGBA", (100, 4), (255, 0, 0, 255))
        b = Image.new("RGBA", (100, 4), (0, 0, 255, 255))
        strip = dl.region_plate([a, b], 0.5, window=20)
        self.assertEqual(strip.size, (150, 4))
        self.assertEqual(strip.getpixel((10, 1)), (255, 0, 0, 255))   # chunk 0 at rest
        self.assertEqual(strip.getpixel((140, 1)), (0, 0, 255, 255))  # chunk 1 past the window

    def test_masks_are_written_for_the_parallax_bands_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            region = Path(tmp)
            bands = ["sky", "far", "mid", "rear", "play", "water"]
            written = dl.write_masks(region, "c-0-0", bands, (6, 1))
            self.assertEqual([p.name for p in written], ["c-0-0.00-sky.png", "c-0-0.01-far.png", "c-0-0.02-mid.png"])
            alpha = list(Image.open(written[1]).getchannel("A").getdata())
            self.assertEqual(alpha, [0, 255, 0, 0, 0, 0])


    def test_blended_plate_fades_between_neighbours(self):
        # Two 100x2 opaque plates at scroll 0.5 overlap by 50 px; a 20 px fade sits in the overlap's middle.
        a = Image.new("RGBA", (100, 2), (200, 0, 0, 255))
        b = Image.new("RGBA", (100, 2), (0, 0, 200, 255))
        strip = dl.blended_plate([a, b], 0.5, 20)
        self.assertEqual(strip.size, (150, 2))
        self.assertEqual(strip.getpixel((60, 0)), (200, 0, 0, 255))   # before the fade
        self.assertEqual(strip.getpixel((75, 0)), (100, 0, 100, 255))  # half way
        self.assertEqual(strip.getpixel((90, 0)), (0, 0, 200, 255))   # after it

    def test_a_hole_continues_the_band_above_it(self):
        import numpy as np
        # One column: rear, water, then a foreground hole; the hole under the water is water.
        bands = np.array([["mid"], ["rear"], ["water"], ["foreground"], ["foreground"]])
        hole = bands == "foreground"
        self.assertEqual(list(dl.continuation(bands, hole)[:, 0]), ["", "", "", "water", "water"])
        # A hole with nothing above it at scroll 1 takes the band below.
        bands = np.array([["sky"], ["near"], ["play"]])
        self.assertEqual(dl.continuation(bands, bands == "near")[1, 0], "play")

    def test_walk_top_prefers_the_longest_line(self):
        import json as js
        with tempfile.TemporaryDirectory() as tmp:
            region = Path(tmp)
            walk = [[[0, 50], [300, 50]], [[100, 10], [150, 10]], [[100, 20], [450, 20]]]
            (region / "c.clean.collision.json").write_text(js.dumps({"walk": walk}))
            top = dl.walk_top(region, "c", 500)
            self.assertEqual(top[10], 50)
            self.assertEqual(top[120], 20)  # the 350 px line beats the roof and the shorter one
            self.assertEqual(top[450], -1)

    def test_match_hue_turns_red_plants_toward_orange_foliage(self):
        import colorsys
        import numpy as np
        p = np.zeros((2, 4, 3), int)
        p[0] = [200, 40, 60]   # pinkish red plants
        p[1] = [210, 130, 40]  # orange foliage beside them
        plant = np.zeros((2, 4), bool); plant[0] = True
        out = dl.match_hue(p, plant, p[~plant])
        hue = colorsys.rgb_to_hsv(*(c / 255 for c in out[0]))[0] * 360
        self.assertTrue(hue < 40 or hue > 350, hue)  # toward the orange foliage, never left pink
        pink = np.array([[[200, 60, 160]], [[200, 60, 160]]]); only = np.array([[True], [False]])
        out = dl.match_hue(pink, only, pink[~only])
        self.assertGreater(colorsys.rgb_to_hsv(*(c / 255 for c in out[0]))[0] * 360, 340)  # pink pulled toward red


    def test_a_zone_chunk_reads_its_image_and_its_band(self):
        import json
        with tempfile.TemporaryDirectory() as folder:
            zone = Path(folder)
            (zone / "images").mkdir()
            Image.new("RGB", (8, 4), (1, 2, 3)).save(zone / "images" / "z-0-0.png")
            (zone / "world.json").write_text(json.dumps({"chunks": {"z-0-0": {"band": "below"},
                                                                    "z-0-1": {"band": "level"}}}))
            self.assertEqual(dl.art_for(zone, "z-0-0").getpixel((0, 0)), (1, 2, 3))
            self.assertIn(dl.BAND_KEY["below"], dl.key_prompt(zone, "z-0-0"))
            self.assertEqual(dl.key_prompt(zone, "z-0-1"), dl.KEY_PROMPT)

if __name__ == "__main__":
    unittest.main()
