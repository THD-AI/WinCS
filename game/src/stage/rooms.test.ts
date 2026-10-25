import { describe, expect, it } from 'vitest';
import { DoorUse, doorProblems, ladderHint, nearDoor, nearNote } from './rooms';
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

describe('rooms: what can be used shows itself', () => {
  it('lights a door you come up to on its floor, not one above or below you', () => {
    expect(nearDoor(at(3150, 1076), [shed, cellar])).toBe(cellar);
    expect(nearDoor(at(3300, 1076), [shed, cellar])).toBeUndefined();
    expect(nearDoor(at(3040, 900), [shed, cellar])).toBeUndefined();
  });
  it("shows the climb at a ladder's foot and top, not beside it", () => {
    const ladder: Box = { kind: 'ladder', x: 447, y: 342, w: 35, h: 261 };
    expect(ladderHint(at(464, 603), [ladder])).toMatchObject({ up: true });
    expect(ladderHint(at(464, 342), [ladder])).toMatchObject({ up: false });
    expect(ladderHint(at(600, 603), [ladder])).toBeUndefined();
  });
});
