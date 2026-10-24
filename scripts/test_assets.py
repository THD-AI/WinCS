"""Offline checks for assets.py: frame specs, the state derived from files, sheet drift, and the next steps."""
import json
from pathlib import Path
import tempfile
import unittest

import assets as a


class AssetSystemTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.saved = (a.ROOT, a.IMAGES, a.SPRITES, a.UI, a.STAGES)
        a.ROOT, a.IMAGES, a.SPRITES, a.UI, a.STAGES = base, base / "images", base / "sprites", base / "ui", base / "stages"
        for d in (a.IMAGES, a.SPRITES, a.UI, a.STAGES / "hidden-garden"):
            d.mkdir(parents=True)
        self.addCleanup(lambda: (setattr(a, "ROOT", self.saved[0]), setattr(a, "IMAGES", self.saved[1]),
                                 setattr(a, "SPRITES", self.saved[2]), setattr(a, "UI", self.saved[3]),
                                 setattr(a, "STAGES", self.saved[4])))
        self.boards = {"walker": {"id": "walker", "review": "✅ Approved"}, "drafty": {"id": "drafty", "review": "🟡 Drawn"},
                       "plan": {"id": "plan"}, "key": {"id": "key", "review": "🟡"}}

    def export(self, aid, clips):
        for ext in (".png", ".json"):
            (a.SPRITES / f"{aid}{ext}").write_text("x", encoding="utf-8")
        (a.SPRITES / f"{aid}.anims.json").write_text(json.dumps(clips), encoding="utf-8")

    def test_frame_spec_reads_names_and_counts(self):
        self.assertEqual(a.frame_spec("idle 6 · idle-walk 2 · walk 8"), {"idle": 6, "idle-walk": 2, "walk": 8})
        self.assertEqual(a.frame_spec("–"), {})

    def test_states_come_from_the_files(self):
        self.export("walker", {"walk": {"frames": 8}})
        (a.IMAGES / "drafty.png").write_text("x", encoding="utf-8")
        (a.UI / "key.png").write_text("x", encoding="utf-8")
        row = lambda aid, frames="": {"id": aid, "kind": "sprite", "frames/anims": frames, "status": ""}
        self.assertEqual(a.derive(row("walker", "walk 8"), self.boards), ("approved", []))
        self.assertEqual(a.derive(row("drafty"), self.boards)[0], "drawn")
        self.assertEqual(a.derive(row("plan"), self.boards)[0], "planned")
        self.assertEqual(a.derive(row("key"), self.boards)[0], "exported")  # key art: an image, not an atlas
        self.assertEqual(a.derive({"id": "layer", "kind": "stage layer", "status": "approved"}, self.boards)[0], "approved")

    def test_check_reports_frame_count_drift(self):
        self.export("walker", {"walk": {"frames": 6}})
        problems = a.check("walker", {"frames/anims": "walk 8 · run 8"})
        self.assertIn("walker:walk: 6 frames exported, inventory says 8", problems)
        self.assertIn("walker: inventory lists 'run' but the atlas has no such clip", problems)

    def test_status_flags_a_sheet_that_drifted_and_next_skips_done_rows(self):
        self.export("walker", {"walk": {"frames": 8}})
        rows = [{"id": "walker", "kind": "sprite", "frames/anims": "walk 8", "status": "exported"},
                {"id": "plan", "kind": "sprite", "status": "planned"},
                {"id": "gone", "kind": "ui", "status": "n/a"}]
        _, issues = a.status(rows, self.boards)
        self.assertEqual(issues, ["walker: the sheet says 'exported', the files say 'approved'"])
        self.assertEqual(a.upcoming(rows, self.boards), ["plan [planned] -> python scripts/make_boards.py draw plan"])

    def test_data_rows_look_for_region_json(self):
        row = {"id": "data", "kind": "data", "status": "missing"}
        self.assertEqual(a.derive(row, self.boards)[0], "missing")
        (a.STAGES / "hidden-garden" / "surfaces.json").write_text("{}", encoding="utf-8")
        self.assertEqual(a.derive(row, self.boards)[0], "approved")


if __name__ == "__main__":
    unittest.main()
