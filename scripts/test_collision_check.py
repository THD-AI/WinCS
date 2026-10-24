"""Offline checks for collision_check.py: schema, reachability with the 28x76 body, committed stages."""
import copy
from pathlib import Path
import subprocess
import sys
import unittest

import collision_check as cc

SCRIPT = Path(__file__).with_name('collision_check.py')


def chunk(**fields):
    """A 600x400 chunk: one floor at y=300 from edge to edge, the player on it."""
    data = {'chunk': 'x-0-0', 'state': 'anomaly', 'size': [600, 400], 'walk': [[[0, 300], [600, 300]]],
            'slide': [], 'oneWay': [], 'climb': [], 'solid': [], 'noGo': [], 'hazard': [], 'interact': [],
            'spawn': [{'id': 'player', 'kind': 'player', 'x': 50, 'y': 300}], 'ledge': [], 'glideLift': []}
    data.update(fields)
    return data


NAME = 'x-0-0.anomaly.collision.json'


def problems(data):
    return cc.validate(data, NAME) or cc.reach(data, NAME)


class CollisionCheckTests(unittest.TestCase):
    def test_a_flat_floor_passes(self):
        self.assertEqual(problems(chunk()), [])

    def test_schema_errors_are_named(self):
        data = chunk(walk=[[[600, 300], [0, 300]]])
        self.assertIn(f'{NAME}: walk[0] must run left to right', problems(data))
        data = chunk(walk=[[[0, 300], [100, 150], [600, 150]]])
        self.assertTrue(any('slope over 40°' in p for p in problems(data)))
        data = chunk(interact=[{'id': 'a', 'kind': 'Coffee Machine', 'x': 1, 'y': 1, 'w': 5, 'h': 5}])
        self.assertTrue(any('lower-case kind' in p for p in problems(data)))
        data = chunk()
        del data['ledge']
        self.assertEqual(problems(data), [f"{NAME}: missing field 'ledge'"])
        data = chunk(solid=[{'x': 590, 'y': 0, 'w': 20, 'h': 50}])
        self.assertTrue(any('outside the 600x400 chunk' in p for p in problems(data)))

    def test_a_deck_too_high_needs_a_ladder(self):
        high = [[[200, 150], [400, 150]]]  # 150 px above the floor: more than a held jump
        pickup = {'id': 'muffin', 'kind': 'pickup', 'x': 290, 'y': 120, 'w': 20, 'h': 30}
        data = chunk(oneWay=high, interact=[pickup])
        self.assertEqual(problems(data), [f'{NAME}: interact muffin is not reachable by the body'])
        data['climb'] = [{'id': 'ladder', 'kind': 'ladder', 'x': 220, 'y': 145, 'w': 28, 'h': 160}]
        self.assertEqual(problems(data), [])

    def test_a_low_deck_is_reached_by_jumping(self):
        low = [[[200, 230], [400, 230]]]  # 70 px: within a held jump
        data = chunk(oneWay=low, spawn=chunk()['spawn'] + [{'id': 'crab', 'kind': 'crab', 'x': 300, 'y': 230}])
        self.assertEqual(problems(data), [])

    def test_a_wall_blocks_the_way_and_a_ladder_over_it_does_not_count_unless_it_lands(self):
        wall = [{'x': 300, 'y': 100, 'w': 30, 'h': 200}]
        data = chunk(walk=[[[0, 300], [300, 300]], [[330, 300], [600, 300]]], solid=wall)
        self.assertEqual(problems(data), [f'{NAME}: the right edge is not reachable'])
        # A deck over the wall, reached by a ladder, lets the body drop down on the far side.
        data['oneWay'] = [[[200, 90], [360, 90]]]
        data['climb'] = [{'id': 'ladder', 'kind': 'ladder', 'x': 220, 'y': 85, 'w': 28, 'h': 220}]
        self.assertEqual(problems(data), [])

    def test_a_gap_wider_than_a_running_jump_is_not_crossed(self):
        data = chunk(walk=[[[0, 300], [200, 300]], [[200 + cc.ACROSS + 30, 300], [600, 300]]])
        self.assertEqual(problems(data), [f'{NAME}: the right edge is not reachable'])
        data['walk'][1][0][0] = 200 + cc.ACROSS - 10
        self.assertEqual(problems(data), [])

    def test_committed_stages_pass_and_neighbours_meet(self):
        run = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    def test_faces_are_line_ends_nothing_passes_under(self):
        tiers = [[[0, 300], [200, 300]], [[200, 270], [400, 270]]]
        self.assertIn({'x': 200, 'top': 270, 'side': -1}, cc.faces(chunk(walk=tiers)))
        bench = [[[0, 300], [600, 300]], [[200, 260], [300, 260]]]  # the trail runs on in front of it
        self.assertFalse([f for f in cc.faces(chunk(walk=bench)) if f['top'] == 260])
        seam = [[[0, 300], [200, 300]], [[200, 290], [600, 290]]]  # a step: no face
        self.assertFalse([f for f in cc.faces(chunk(walk=seam)) if f['x'] == 200])

    def test_terrain_kinds_materials_coverage_and_flat_treads(self):
        typed = lambda *ranges: cc.terrain(chunk(walk=[[[0, 300], [300, 300]], [[300, 296], [600, 280]]],
                                                 terrain=list(ranges)), NAME, {'stone', 'wood'})
        ground = {'x': [0, 300], 'kind': 'ground', 'material': 'stone'}
        self.assertEqual(typed(ground, {'x': [300, 600], 'kind': 'ground', 'material': 'stone'}), [])
        self.assertTrue(any('is a slope; treads are flat' in p for p in typed(ground, {'x': [300, 600], 'kind': 'plank', 'material': 'wood'})))
        self.assertTrue(any('has no terrain type' in p for p in typed(ground)))
        self.assertTrue(any("kind 'lava'" in p for p in typed(ground, {'x': [300, 600], 'kind': 'lava', 'material': 'stone'})))
        self.assertTrue(any("material 'ice'" in p for p in typed(ground, {'x': [300, 600], 'kind': 'ground', 'material': 'ice'})))

    def test_a_wall_taller_than_a_jump_at_the_foot_of_a_floor_is_named(self):
        walls = [[[0, 300], [200, 300]], [[200, 205], [600, 205]]]  # 95 px: stops the body, no jump clears it
        ranges = [{'x': [0, 600], 'kind': 'ground', 'material': 'stone'}]
        self.assertTrue(any('more than a jump' in p for p in cc.terrain(chunk(walk=walls, terrain=ranges), NAME, None)))

    def test_edge_heights(self):
        left = chunk(walk=[[[0, 300], [600, 280]]])
        self.assertEqual(cc.floor_at_edge(left, True), 280)
        self.assertEqual(cc.floor_at_edge(copy.deepcopy(left), False), 300)


if __name__ == '__main__':
    unittest.main()
