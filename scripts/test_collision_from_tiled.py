"""Small hand-authored Tiled export covering every docs/13 collision layer."""
import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from collision_from_tiled import LAYERS, convert, write_collision


def props(**values):
    return [{'name': key, 'type': 'int' if type(value) is int else 'string', 'value': value}
            for key, value in values.items()]


def fixture():
    layers = []
    for index, name in enumerate(LAYERS):
        obj = {'id': index + 1, 'x': 100, 'y': 200, 'width': 30, 'height': 40, 'rotation': 0}
        if name in ('walk', 'slide', 'one-way'):
            obj.update(width=0, height=0, polyline=[{'x': 0, 'y': 0}, {'x': 80, 'y': -20}])
        elif name in ('spawn', 'ledge'):
            obj.update(width=0, height=0, point=True)
        if name in ('climb', 'interact', 'spawn'):
            kind = {'climb': 'ladder', 'interact': 'coffee-machine', 'spawn': 'player'}[name]
            obj['properties'] = props(kind=kind, id=f'{name}-one')
        if name == 'hazard':
            obj['properties'] = props(damage=1)
        layers.append({'type': 'objectgroup', 'name': name, 'objects': [obj]})
    return {'type': 'map', 'orientation': 'orthogonal', 'infinite': False,
            'width': 135, 'height': 45, 'tilewidth': 16, 'tileheight': 16,
            'properties': props(region='rusty-creek', chunk='rc-0-0', state='anomaly'),
            'layers': layers}


class CollisionFromTiledTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture()

    def object(self, name):
        return next(layer['objects'][0] for layer in self.data['layers'] if layer['name'] == name)

    def test_exports_all_contract_shapes_and_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'example.tmj'
            source.write_text(json.dumps(self.data), encoding='utf-8')
            output = write_collision(source, folder)
            self.assertEqual(output.relative_to(folder).as_posix(),
                             'art/stages/rusty-creek/rc-0-0.anomaly.collision.json')
            actual = json.loads(output.read_text())
        self.assertEqual(actual['size'], [2160, 720])
        self.assertEqual(actual['walk'], [[[100, 200], [180, 180]]])
        self.assertEqual(actual['oneWay'], actual['walk'])
        self.assertEqual(actual['climb'], [dict(x=100, y=200, w=30, h=40, kind='ladder', id='climb-one')])
        self.assertEqual(actual['spawn'], [dict(x=100, y=200, kind='player', id='spawn-one')])
        self.assertEqual(actual['hazard'], [dict(x=100, y=200, w=30, h=40, damage=1)])
        self.assertTrue(all(len(actual[key]) == 1 for key in LAYERS.values()))

    def test_layer_offset_and_image_backdrop(self):
        self.data['layers'][0].update(offsetx=10, offsety=-20)
        self.data['layers'].append({'type': 'imagelayer', 'name': 'composed chunk', 'image': 'chunk.png'})
        self.assertEqual(convert(self.data)[1]['walk'], [[[110, 180], [190, 160]]])

    def test_unknown_layer_and_wrong_layer_type(self):
        for changes in ({'name': 'typo'}, {'type': 'tilelayer'}):
            with self.subTest(changes=changes):
                data = copy.deepcopy(self.data)
                data['layers'][0].update(changes)
                with self.assertRaises(ValueError):
                    convert(data)

    def test_open_and_degenerate_boxes_fail(self):
        for changes in ({'polyline': [{'x': 0, 'y': 0}, {'x': 30, 'y': 40}]},
                        {'polygon': []}, {'width': 0}, {'height': -1}, {'rotation': 45}):
            with self.subTest(changes=changes):
                data = copy.deepcopy(self.data)
                data['layers'][3]['objects'][0].update(changes)
                with self.assertRaises(ValueError):
                    convert(data)

    def test_out_of_bounds_points_lines_and_boxes_fail(self):
        for name, changes in [('spawn', {'x': 2161}), ('ledge', {'y': -1}),
                              ('solid', {'x': 2150}), ('walk', {'x': 2150})]:
            with self.subTest(name=name):
                data = copy.deepcopy(self.data)
                obj = next(layer['objects'][0] for layer in data['layers'] if layer['name'] == name)
                obj.update(changes)
                with self.assertRaisesRegex(ValueError, 'outside'):
                    convert(data)

    def test_fractional_nonfinite_and_bool_coordinates_fail(self):
        for value in (0.5, float('nan'), float('inf'), True):
            with self.subTest(value=value):
                self.object('spawn')['x'] = value
                with self.assertRaises(ValueError):
                    convert(self.data)

    def test_leftward_or_vertical_ground_fails(self):
        for x in (-1, 0):
            self.object('walk')['polyline'][1]['x'] = x
            with self.assertRaisesRegex(ValueError, 'left to right'):
                convert(self.data)

    def test_missing_metadata_or_traversal_never_writes(self):
        for metadata in (props(), props(region='../escape', chunk='rc-0-0', state='clean'),
                         props(region='rusty-creek', chunk='rc-0-0', state='wrong')):
            self.data['properties'] = metadata
            with self.assertRaises(ValueError):
                convert(self.data)

    def test_required_object_properties_and_unique_ids(self):
        self.object('spawn')['properties'] = props(kind='player')
        with self.assertRaisesRegex(ValueError, 'missing id'):
            convert(self.data)
        self.object('spawn')['properties'] = props(kind='player', id='climb-one')
        with self.assertRaisesRegex(ValueError, 'duplicate id'):
            convert(self.data)

    def test_failed_conversion_does_not_overwrite_existing_output(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'example.tmj'
            source.write_text(json.dumps(self.data))
            output = write_collision(source, folder)
            original = output.read_bytes()
            self.object('solid')['width'] = 0
            source.write_text(json.dumps(self.data))
            with self.assertRaises(ValueError):
                write_collision(source, folder)
            self.assertEqual(output.read_bytes(), original)

    def test_cli_writes_contract_and_exits_loudly_on_bad_input(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'scripts').mkdir()
            script = root / 'scripts' / 'collision_from_tiled.py'
            shutil.copy(Path(__file__).with_name('collision_from_tiled.py'), script)
            source = root / 'export.tmj'
            source.write_text(json.dumps(self.data))
            command = [sys.executable, str(script), str(source)]
            good = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertTrue((root / 'art/stages/rusty-creek/rc-0-0.anomaly.collision.json').exists())
            self.data['layers'][0]['name'] = 'typo'
            source.write_text(json.dumps(self.data))
            bad = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(bad.returncode, 1)
            self.assertIn('unknown collision layer', bad.stderr)


if __name__ == '__main__':
    unittest.main()
