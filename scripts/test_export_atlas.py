"""Offline checks for export_atlas.py on synthetic boards: slicing, counts, scale, feet, Phaser JSON."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw

import export_atlas as ea

SCRIPT = Path(__file__).with_name('export_atlas.py')


def figure(draw, x, ground, w=10, h=40, lift=0, colour=(40, 90, 160, 255)):
    """A body of w x h standing (or floating `lift` px) on the ground line, with two feet."""
    bottom = ground - lift
    draw.rectangle((x, bottom - h, x + w - 1, bottom - 5), fill=colour)
    draw.rectangle((x, bottom - 4, x + 2, bottom - 1), fill=colour)          # left foot
    draw.rectangle((x + w - 3, bottom - 4, x + w - 1, bottom - 1), fill=colour)  # right foot


def board_image(rows):
    """rows: list of lists of (h, lift); figures 30 px apart, rows 60 px apart, grounds at 50, 110…"""
    image = Image.new('RGBA', (30 * max(len(r) for r in rows) + 20, 60 * len(rows) + 10), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for r, row in enumerate(rows):
        for i, (h, lift) in enumerate(row):
            figure(draw, 10 + 30 * i, 50 + 60 * r, h=h, lift=lift)
    return image


def config(rows, height=20):
    return {'id': 'test', 'atlas': {'height': height, 'rows': rows}}


class ExportAtlasTests(unittest.TestCase):
    def test_frames_are_named_per_animation_and_row(self):
        image = board_image([[(40, 0)] * 3, [(40, 0)] * 2 + [(30, 10)] * 2])
        board = config([[{'anim': 'idle', 'frames': 3}],
                        [{'anim': 'walk', 'frames': 2}, {'anim': 'jump', 'frames': 2, 'loop': False, 'fps': 10}]])
        sheet, atlas, table = ea.export(board, image)
        self.assertEqual(list(atlas['frames']),
                         ['idle-00', 'idle-01', 'idle-02', 'walk-00', 'walk-01', 'jump-00', 'jump-01'])
        self.assertEqual(table, {'idle': {'frames': 3, 'fps': 12, 'loop': True},
                                 'walk': {'frames': 2, 'fps': 12, 'loop': True},
                                 'jump': {'frames': 2, 'fps': 10, 'loop': False}})
        self.assertEqual(atlas['meta']['image'], 'test.png')
        self.assertEqual(atlas['meta']['size'], {'w': sheet.width, 'h': sheet.height})
        for frame in atlas['frames'].values():
            self.assertEqual(frame['pivot'], {'x': 0.5, 'y': 1})
            r = frame['frame']
            self.assertLessEqual(r['x'] + r['w'], sheet.width)
            self.assertLessEqual(r['y'] + r['h'], sheet.height)

    def test_frame_count_mismatch_fails_loudly(self):
        image = board_image([[(40, 0)] * 3])
        with self.assertRaisesRegex(ea.AtlasError, r'row 1 has 3 frames, the config expects 4 \(idle 4\)'):
            ea.export(config([[{'anim': 'idle', 'frames': 4}]]), image)

    def test_row_count_mismatch_fails_loudly(self):
        image = board_image([[(40, 0)] * 2, [(40, 0)] * 2])
        with self.assertRaisesRegex(ea.AtlasError, 'has 2 rows of sprites, the config lists 1'):
            ea.export(config([[{'anim': 'idle', 'frames': 2}]]), image)

    def test_bad_config_fails_loudly(self):
        image = board_image([[(40, 0)] * 2])
        with self.assertRaisesRegex(ea.AtlasError, 'listed twice'):
            ea.export(config([[{'anim': 'a', 'frames': 1}, {'anim': 'a', 'frames': 1}]]), image)
        with self.assertRaisesRegex(ea.AtlasError, 'no "atlas"'):
            ea.export({'id': 'test'}, image)
        with self.assertRaisesRegex(ea.AtlasError, 'frame count'):
            ea.export(config([[{'anim': 'a', 'frames': 0}]]), image)

    def test_skipped_rows_and_specks_are_ignored(self):
        image = board_image([[(40, 0)] * 2, [(40, 0)] * 5])
        image.putpixel((image.width - 3, 20), (255, 255, 255, 255))  # a stray pixel in row 1
        _, atlas, table = ea.export(config([[{'anim': 'idle', 'frames': 2}], 'skip']), image)
        self.assertEqual(list(table), ['idle'])
        self.assertEqual(len(atlas['frames']), 2)

    def test_scale_feet_and_baseline(self):
        # Idle 40 px -> 20 game px (factor 0.5); the jump frame floats 10 px (5 game px) above the ground.
        image = board_image([[(40, 0), (30, 10)]])
        sheet, atlas, _ = ea.export(config([[{'anim': 'idle', 'frames': 1}, {'anim': 'jump', 'frames': 1}]]), image)
        idle, jump = (atlas['frames'][n]['frame'] for n in ('idle-00', 'jump-00'))
        self.assertEqual(idle['h'], 20 + ea.PAD_TOP)

        def box(r):
            return sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])).getchannel('A').getbbox()
        left, top, right, bottom = box(idle)
        self.assertEqual(bottom, idle['h'])            # feet on the cell's bottom row
        self.assertEqual(bottom - top, 20)             # scaled to the configured height
        self.assertAlmostEqual((left + right) / 2, idle['w'] / 2, delta=1)  # pivot centred on the feet
        self.assertEqual(jump['h'] - box(jump)[3], 5)  # still in the air, at game scale

    def test_alpha_stays_hard(self):
        image = board_image([[(40, 0)] * 2])
        sheet, _, _ = ea.export(config([[{'anim': 'idle', 'frames': 2}]], height=13), image)
        self.assertTrue(set(sheet.getchannel('A').getdata()) <= {0, 255})

    def test_command_line_writes_the_contract_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'images').mkdir()
            board_image([[(40, 0)] * 2]).save(root / 'images' / 'test.png')
            boards = root / 'boards.json'
            boards.write_text(json.dumps({'boards': [config([[{'anim': 'idle', 'frames': 2}]])]}), encoding='utf-8')
            out = root / 'sprites'
            run = subprocess.run([sys.executable, str(SCRIPT), 'test', '--config', str(boards), '--out', str(out)],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertTrue((out / 'test.png').exists())
            self.assertEqual(json.loads((out / 'test.anims.json').read_text())['idle']['frames'], 2)
            self.assertIn('idle-01', json.loads((out / 'test.json').read_text())['frames'])

            boards.write_text(json.dumps({'boards': [config([[{'anim': 'idle', 'frames': 3}]])]}), encoding='utf-8')
            run = subprocess.run([sys.executable, str(SCRIPT), 'test', '--config', str(boards), '--out', str(out)],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, 1)
            self.assertIn('row 1 has 2 frames', run.stderr)


if __name__ == '__main__':
    unittest.main()
