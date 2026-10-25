import { describe, expect, it } from 'vitest';
import { LEVELS, nextLevel, nextSpot, spots } from './teleports';
import type { Geometry } from './collision';

const world = (extra: Partial<Geometry>): Geometry => ({ walk: [], slide: [], oneWay: [], solid: [], climb: [], noGo: [],
  hazard: [], interact: [], spawn: [], ledge: [], glideLift: [], ...extra });
const chunk = (id: string, extra: Partial<Geometry>) => ({ local: { chunk: id } as never, world: world(extra) });

const garden = [
  chunk('hg-0-0', { walk: [[[0, 400], [2160, 400]]], spawn: [{ id: 'p', kind: 'player', x: 120, y: 400 }] }),
  chunk('hg-1-0', { walk: [[[2160, 380], [4320, 380]]],
    interact: [{ id: 'coffee', kind: 'coffee-machine', x: 3000, y: 300, w: 40, h: 80 },
      { id: 'shed-door', kind: 'door', to: 'cellar-stairs', x: 3500, y: 304, w: 80, h: 76 }] }),
  chunk('hg-1-1', { walk: [[[2160, 1060], [4320, 1060]]],
    interact: [{ id: 'cellar-stairs', kind: 'door', to: 'shed-door', x: 3500, y: 984, w: 80, h: 76 }] }),
];

describe('debug teleport', () => {
  it('lists the start, the save points, doors and every chunk, row by row, left to right', () => {
    const all = spots(garden);
    expect(all.map(s => s.label)).toEqual(['Chunk hg-0-0', 'Start', 'Chunk hg-1-0', 'Coffee machine (save)',
      'Door: shed-door', 'Chunk hg-1-1', 'Door: cellar-stairs']);
    expect(all.find(s => s.label === 'Coffee machine (save)')).toEqual({ label: 'Coffee machine (save)', x: 3020, y: 380 });
  });
  it('steps to the next place in the hero\'s own row, either way, and stops at the ends', () => {
    const all = spots(garden);
    expect(nextSpot(all, { x: 200, y: 400 }, 1)?.label).toBe('Chunk hg-1-0');
    expect(nextSpot(all, { x: 3020, y: 380 }, -1)?.label).toBe('Chunk hg-1-0');
    expect(nextSpot(all, { x: 3540, y: 380 }, 1)).toBeUndefined();         // the last place in the garden row
    expect(nextSpot(all, { x: 2200, y: 1060 }, 1)?.label).toBe('Door: cellar-stairs');
  });
  it('goes through the levels in story order and wraps', () => {
    expect(nextLevel(LEVELS[0])).toEqual({ region: 'hidden-garden', state: 'anomaly' });
    expect(nextLevel(LEVELS[1])).toEqual({ region: 'rusty-creek', state: 'clean' });
    expect(nextLevel(LEVELS[3])).toEqual({ region: 'hidden-garden', state: 'clean' });
  });
});
