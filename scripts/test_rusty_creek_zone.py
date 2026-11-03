"""The Rusty Creek zone's committed collision (#157): walked both ways, the culvert paired with the drain door, the
level row on its path and the railway girder's deck."""
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "zones"))
import rusty_creek_zone as rc  # noqa: E402
import world_map as wm  # noqa: E402


def committed() -> tuple[dict, dict]:
    world = json.loads((rc.ZONE / "world.json").read_text(encoding="utf-8"))
    grid = {cid: (c["col"], c["row"]) for cid, c in world["chunks"].items()}
    collisions = {cid: json.loads((rc.ZONE / "collision" / f"{cid}.collision.json").read_text(encoding="utf-8"))
                  for cid in grid}
    return grid, collisions


class RustyCreekZoneTests(unittest.TestCase):
    def test_every_surface_is_reachable_and_leavable(self):
        grid, collisions = committed()
        self.assertEqual(wm.check(rc.graph(collisions, grid)), [])

    def test_the_culvert_and_the_drain_door_lead_to_each_other(self):
        _, collisions = committed()
        culvert = next(i for i in collisions["rcz-2-1"]["interact"] if i["id"] == "culvert")
        drain = next(i for i in collisions["rcz-2-2"]["interact"] if i["id"] == "drain-door")
        self.assertEqual((culvert["to"], drain["to"]), ("drain-door", "culvert"))
        self.assertEqual(culvert["x"], drain["x"])  # straight above each other: the graph joins them across the seam

    def test_the_level_row_walks_the_path_and_the_girder_deck(self):
        _, collisions = committed()
        for col in range(3):
            cid = f"rcz-{col}-1"
            ys = sorted({line[0][1] for line in collisions[cid]["walk"]})
            self.assertEqual(ys, sorted([rc.PATH, rc.girder_top(cid)]))
            ladder = collisions[cid]["climb"][0]
            self.assertLessEqual(ladder["y"], rc.girder_top(cid))      # up onto the deck
            self.assertEqual(ladder["y"] + ladder["h"], rc.PATH)       # down to the path

    def test_a_ladder_needs_a_floor_or_the_next_row_at_both_ends(self):
        _, collisions = committed()
        for cid in ("rcz-0-2", "rcz-1-2", "rcz-2-2"):
            for c in collisions[cid]["climb"]:
                ends = (c["y"], c["y"] + c["h"])
                floors = [p[1] for line in collisions[cid]["walk"] for p in line]
                for y in ends:
                    self.assertTrue(y in (0, rc.H) or any(abs(f - y) <= 32 for f in floors), (cid, c))


if __name__ == "__main__":
    unittest.main()
