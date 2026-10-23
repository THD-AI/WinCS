"""Offline checks for export_ui.py: rows and pieces, the count check, shared cells, packing, the screen layout."""
import unittest

from PIL import Image

import export_ui as eu

RED = (200, 40, 40, 255)


def board(rows: list[list[tuple[int, int, int, int]]]) -> Image.Image:
    """A transparent board with opaque boxes (x0, y0, x1, y1)."""
    image = Image.new('RGBA', (200, 120))
    for row in rows:
        for box in row:
            image.paste(RED, box)
    return image


class CutTests(unittest.TestCase):
    def test_rows_and_pieces_by_empty_bands(self):
        image = board([[(10, 10, 30, 40), (60, 15, 80, 40)], [(10, 70, 50, 90)]])
        self.assertEqual(eu.rows_of(image), [(10, 40), (70, 90)])
        self.assertEqual(eu.pieces_of(image, 10, 40), [(10, 10, 30, 40), (60, 15, 80, 40)])

    def test_small_gaps_stay_inside_one_piece(self):
        # A dashed outline: dashes 4 px apart are one piece, not many.
        image = board([[(10, 10, 14, 20), (18, 10, 22, 20), (26, 10, 30, 20)]])
        self.assertEqual(len(eu.pieces_of(image, 10, 20)), 1)

    def test_count_check_stops_the_export(self):
        image = board([[(10, 10, 30, 40), (60, 10, 80, 40)]])
        spec = {'id': 'b', 'ui': {'rows': [{'names': ['only-one'], 'height': 30}]}}
        with self.assertRaises(SystemExit):
            eu.cut(spec, image, {})

    def test_row_scaled_to_height_and_cells_shared(self):
        image = board([[(10, 10, 30, 40), (60, 20, 76, 40)]])
        spec = {'id': 'b', 'ui': {'rows': [{'names': ['a', 'b'], 'height': 15, 'cell': True}]}}
        pieces = eu.cut(spec, image, {})
        self.assertEqual(pieces['a'].size, (10, 15))
        self.assertEqual(pieces['b'].size, pieces['a'].size)

    def test_like_reuses_the_crop_and_scale(self):
        frame = board([[(20, 10, 120, 70)]])
        crops = {}
        eu.cut({'id': 'f', 'ui': {'rows': [{'names': ['pocket-frame'], 'width': 50}]}}, frame, crops)
        screen = Image.new('RGBA', (200, 120))
        screen.paste(RED, (40, 30, 100, 50))
        out = eu.cut({'id': 's', 'ui': {'like': 'pocket-frame', 'name': 'crt-screen'}}, screen, crops)
        self.assertEqual(out['crt-screen'].size, (50, 30))
        lay = eu.layout({'pocket-frame': eu.scale_to(frame.crop((20, 10, 120, 70)), 0.5), **out})
        self.assertEqual(lay['pocket-frame']['screen'], [10, 10, 30, 10])


class SizeTests(unittest.TestCase):
    def test_short_side_sets_corridor_thickness(self):
        image = board([[(10, 10, 70, 30), (100, 10, 120, 70)]])
        spec = {'id': 'c', 'ui': {'rows': [{'names': ['h', 'v'], 'short_side': 5}]}}
        pieces = eu.cut(spec, image, {})
        self.assertEqual(pieces['h'].size, (15, 5))
        self.assertEqual(pieces['v'].size, (5, 15))

    def test_nine_slice_keeps_the_border_width(self):
        tile = Image.new('RGBA', (40, 20), (0, 80, 40, 255))
        tile.paste((200, 255, 220, 255), (0, 0, 40, 3))  # a 3 px glowing top edge
        out = eu.nine_slice(tile, 24, 18, 4)
        self.assertEqual(out.size, (24, 18))
        self.assertEqual(out.getpixel((12, 2)), (200, 255, 220, 255))
        self.assertEqual(out.getpixel((12, 3)), (0, 80, 40, 255))

    def test_layout_carries_the_measured_placements(self):
        lay = eu.layout({}, {'_measured': 'note', 'cells': {'x': 43, 'y': 43, 'pitch': 48}})
        self.assertEqual(lay, {'cells': {'x': 43, 'y': 43, 'pitch': 48}})


class PackTests(unittest.TestCase):
    def test_every_piece_is_in_the_atlas_without_overlap(self):
        pieces = {f'p{i}': Image.new('RGBA', (300 + i * 10, 20 + i), RED) for i in range(12)}
        atlas, data = eu.pack(pieces)
        boxes = [(f['frame']['x'], f['frame']['y'], f['frame']['w'], f['frame']['h']) for f in data['frames'].values()]
        self.assertEqual(len(boxes), 12)
        for i, a in enumerate(boxes):
            self.assertLessEqual(a[0] + a[2], atlas.width)
            self.assertLessEqual(a[1] + a[3], atlas.height)
            for b in boxes[i + 1:]:
                overlap = a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]
                self.assertFalse(overlap)


if __name__ == '__main__':
    unittest.main()
