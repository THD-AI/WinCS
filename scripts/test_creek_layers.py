"""Failures that would invalidate the route contract or registered decomposition."""
import unittest

from PIL import Image

import creek_layers as creek


class CreekContractTests(unittest.TestCase):
    def setUp(self):
        self.route = creek.read(creek.BASE / 'route.json')

    def test_disconnected_exit_is_rejected(self):
        self.route['edges'] = [e for e in self.route['edges']
                               if 'exit' not in (e['from'], e['to'])]
        self.assertTrue(any('unreachable' in e for e in creek.route_errors(self.route)))

    def test_spur_needs_a_return(self):
        self.route['edges'].append({'from': 'l-lookout', 'to': 'entry', 'kind': 'walk'})
        self.assertTrue(any('dead ends' in e for e in creek.route_errors(self.route)))

    def test_ladder_must_be_vertical(self):
        self.route['edges'][0]['kind'] = 'ladder'
        self.assertTrue(any('vertical' in e for e in creek.route_errors(self.route)))

    def test_jump_must_fit_proposed_envelope(self):
        self.route['edges'].append({'from': 'entry', 'to': 'exit', 'kind': 'jump'})
        self.assertTrue(any('jump exceeds' in e for e in creek.route_errors(self.route)))

    def test_partition_preserves_semitransparent_pixels(self):
        source = Image.new('RGBA', (creek.W, creek.H), (40, 100, 140, 127))
        rear, front = creek.split_structure(source, [[0, 0, 800, creek.H-1]])
        self.assertEqual(creek.changed(Image.alpha_composite(rear, front), source), 0)
        self.assertEqual(rear.getpixel((801, 10)), (0, 0, 0, 0))
        self.assertEqual(front.getpixel((800, 10)), (0, 0, 0, 0))

    def test_matte_cleanup_preserves_rust_and_transparency(self):
        source = Image.new('RGBA', (3, 1))
        source.putdata([(255, 0, 0, 255), (174, 95, 42, 255), (200, 80, 30, 0)])
        cleaned = creek.remove_matte(source)
        self.assertEqual(cleaned.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(cleaned.getpixel((1, 0)), source.getpixel((1, 0)))
        self.assertEqual(cleaned.getpixel((2, 0)), source.getpixel((2, 0)))


if __name__ == '__main__':
    unittest.main()
