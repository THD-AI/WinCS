"""Offline checks for scripts/zones/hidden_garden_proof.py: the collision traced from a depth key (synthetic keys,
no model calls) and the doors in the reachability graph."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("hidden_garden_proof", HERE / "zones" / "hidden_garden_proof.py")
hg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hg)
W, H = hg.W, hg.H


def key(*boxes):
    """A depth key (H x W band names): the back wall, with play-coloured boxes (x0, y0, x1, y1)."""
    bands = np.full((H, W), "rear", dtype="<U10")
    for x0, y0, x1, y1 in boxes:
        bands[y0:y1, x0:x1] = "play"
    return bands


class TracedCollisionTests(unittest.TestCase):
    def test_a_ladder_is_a_column_of_rungs_16_px_wide_or_more(self):
        rungs = [(500, y, 528, y + 4) for y in range(100, 400, 12)]           # 25 rungs, 28 px wide
        thin = [(900, y, 908, y + 4) for y in range(100, 400, 12)]            # a pillar's edge: 8 px
        found = hg.ladders(key(*rungs, *thin))
        self.assertEqual(len(found), 1)
        x0, x1, top, bottom = found[0]
        self.assertEqual((x0, x1), (500, 528))
        self.assertLessEqual(top, 100)
        self.assertGreaterEqual(bottom, 390)

    def test_a_floor_runs_on_behind_a_pillar_and_a_scrap_is_dropped(self):
        floor = key((0, 600, 1000, 640), (1100, 600, 2160, 640), (1500, 300, 1580, 320))  # a 100 px pillar gap; an 80 px scrap
        lines = hg.floors(floor, [], 0)
        self.assertEqual(len(lines), 1)                                      # one floor, the scrap gone
        self.assertEqual((lines[0][0][0], lines[0][-1][0]), (0, 2156))
        self.assertTrue(all(y == 600 for _, y in lines[0]))

    def test_headroom_cuts_a_floor_with_another_too_close_above(self):
        upper = [[0, 300], [2160, 300]]
        cramped = [[0, 350], [1000, 350]]                                    # 50 px under the upper floor
        free = [[0, 600], [2160, 600]]
        kept = hg.headroom([upper, cramped, free])                           # (resampled to a point every 48 px)
        spans = sorted((line[0][1], line[0][0], line[-1][0]) for line in kept)
        self.assertEqual(spans, [(300, 0, 2160), (600, 0, 2160)])            # the cramped floor is gone

    def test_floor_at_picks_the_lowest_the_next_and_the_topmost(self):
        lines = [[[0, 600], [2160, 600]], [[0, 340], [2160, 340]], [[0, 120], [2160, 120]]]
        self.assertEqual(hg.floor_at(lines, 500, "low"), 600)
        self.assertEqual(hg.floor_at(lines, 500, "high"), 340)
        self.assertEqual(hg.floor_at(lines, 500, "top"), 120)
        with self.assertRaises(ValueError):
            hg.floor_at([[[0, 600], [100, 600]]], 500, "low")


class DoorTests(unittest.TestCase):
    def test_a_door_pair_joins_the_two_rows_in_the_graph(self):
        shed = {"walk": [[[0, 306], [2160, 306]]], "oneWay": [], "climb": [], "solid": [],
                "interact": [hg.shed_door()]}
        cellar = {"walk": [[[0, 340], [2160, 340]]], "oneWay": [], "climb": [], "solid": [],
                  "interact": [hg.box(1095, 264, 1175, 340, kind="door", id="cellar-stairs", to="shed-door")]}
        grid = {"hgz-0-0": (0, 0), "hgz-0-1": (0, 1)}
        self.assertEqual(hg.reach({"hgz-0-0": shed, "hgz-0-1": cellar}, grid), [])
        cellar["interact"] = []                                              # no door: the cellar is cut off
        self.assertTrue(hg.reach({"hgz-0-0": shed, "hgz-0-1": cellar}, grid))

    def test_every_find_is_a_note_with_a_title_and_text(self):
        for col, nid, x, which, title, text in hg.FINDS:
            self.assertIn(col, (0, 1, 2))
            self.assertIn(which, ("low", "high", "top"))
            self.assertTrue(title and text and 0 < x < W, nid)


if __name__ == "__main__":
    unittest.main()
