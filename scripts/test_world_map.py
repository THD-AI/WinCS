"""Offline checks for world_map.py: a zone's own words for its places, and the Rusty Creek map stays playable."""
import json
from pathlib import Path
import unittest

import world_map as wm

ROOT = Path(__file__).resolve().parents[1]


class WordsTests(unittest.TestCase):
    def test_the_garden_words_are_the_default_and_a_zone_overrides_them_key_by_key(self):
        self.assertEqual(wm.words({}), wm.WORDS)
        own = wm.words({"words": {"roles": {"level": "the creek path"}, "notes": {"mound": "a culvert mouth"}}})
        self.assertEqual(own["roles"], {**wm.WORDS["roles"], "level": "the creek path"})
        self.assertEqual(own["notes"]["mound"], "a culvert mouth")
        self.assertEqual(own["notes"]["rest"], wm.WORDS["notes"]["rest"])

    def test_the_creek_has_no_caves_and_every_surface_is_reachable(self):
        zone = json.loads((ROOT / "art/zones/rusty-creek/zone.json").read_text(encoding="utf-8"))
        world = json.loads((ROOT / "art/zones/rusty-creek/world.json").read_text(encoding="utf-8"))
        text = " ".join(c["brief"] + " " + c["role"] for c in world["chunks"].values())
        text += " ".join(b["note"] for b in world["beats"])
        text = text.replace("never a cave", "").replace("never caves", "")  # the briefs' own warnings
        for word in ("cave", "pond", "cellar"):
            self.assertNotIn(word, text, word)
        generated = wm.generate(zone, world["seed"], *zone["grid"])
        self.assertEqual(wm.check(generated), [])


if __name__ == "__main__":
    unittest.main()
