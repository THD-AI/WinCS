import { describe, expect, it } from 'vitest';
import { DoorUse, doorProblems, nearNote } from './rooms';
import type { Box } from './collision';
import type { Body } from '../player/body';

const shed: Box = { id: 'shed-door', kind: 'door', to: 'cellar-stairs', x: 1000, y: 230, w: 80, h: 76 };
const cellar: Box = { id: 'cellar-stairs', kind: 'door', to: 'shed-door', x: 3000, y: 1000, w: 80, h: 76 };
const at = (x: number, y: number, grounded = true) => ({ x, y, vx: 0, vy: 0, grounded }) as unknown as Body;

describe('rooms: doors', () => {
  it('takes you to the other door\'s floor on a fresh press of up, not while it is held', () => {
    const use = new DoorUse();
    expect(use.step(true, at(1040, 306), true, [shed, cellar])?.to).toEqual({ x: 3040, y: 1076 });
    expect(use.step(true, at(1040, 306), true, [shed, cellar])).toBeUndefined();          // still held
    use.step(false, at(3040, 1076), true, [shed, cellar]);
    expect(use.step(true, at(3040, 1076), true, [shed, cellar])?.door.id).toBe('cellar-stairs');
  });
  it('does nothing in the air, while busy, or away from a door', () => {
    const use = new DoorUse();
    expect(use.step(true, at(1040, 306, false), true, [shed, cellar])).toBeUndefined();
    use.step(false, at(0, 0), true, []);
    expect(use.step(true, at(1040, 306), false, [shed, cellar])).toBeUndefined();
    use.step(false, at(0, 0), true, []);
    expect(use.step(true, at(1500, 306), true, [shed, cellar])).toBeUndefined();
  });
  it('reports a door that leads nowhere or does not lead back', () => {
    expect(doorProblems([shed, cellar])).toEqual([]);
    expect(doorProblems([shed])).toEqual(['door shed-door: no door cellar-stairs']);
    expect(doorProblems([shed, { ...cellar, to: 'elsewhere' }, { ...shed, id: 'elsewhere', to: 'x' }]).length).toBeGreaterThan(0);
  });
});

describe('rooms: notes', () => {
  const note: Box = { id: 'log', kind: 'note', title: 't', text: 'x', x: 500, y: 560, w: 60, h: 60 };
  it('is near when you stand by it, on its floor', () => {
    expect(nearNote(at(530, 620), [note])).toBe(note);
    expect(nearNote(at(700, 620), [note])).toBeUndefined();
    expect(nearNote(at(530, 300), [note])).toBeUndefined();               // the storey above
  });
});
