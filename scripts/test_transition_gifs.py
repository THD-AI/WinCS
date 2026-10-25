"""Offline checks for transition_gifs.py: the 30 fps sampling of the 120 Hz trace, and where a frame is drawn."""
import unittest

import transition_gifs as tg


class TransitionGifTests(unittest.TestCase):
    def test_samples_every_fourth_step(self):
        frames = [{"t": n / 120} for n in range(12)]
        self.assertEqual([f["t"] for f in tg.samples(frames)], [0, 4 / 120, 8 / 120])

    def test_place_puts_the_pivot_on_the_body(self):
        # A 40x100 frame pivoted at its bottom centre, the body 10 px right of the camera and on the ground.
        x, y = tg.place(110, 0, 100, (40, 100), (0.5, 1))
        self.assertEqual((x + 20, y + 100), (tg.SIZE[0] // 2 + 10, tg.GROUND))

    def test_place_lifts_a_body_in_the_air(self):
        _, ground = tg.place(0, 0, 0, (40, 100), (0.5, 1))
        _, air = tg.place(0, -30, 0, (40, 100), (0.5, 1))
        self.assertEqual(ground - air, 30)


if __name__ == "__main__":
    unittest.main()
