import { describe, expect, it } from 'vitest';
import { dexterFor, VISIT_TIMING, VisitSequence } from './coffeeSequence';

const run = (visit: VisitSequence, ms: number) => {
  const seen: string[] = [];
  for (let t = 0; t < ms; t += 50) {
    const phase = visit.update(50);
    if (seen.at(-1) !== phase) seen.push(phase);
  }
  return seen;
};
const FIRST = VISIT_TIMING.bow + VISIT_TIMING.sweat + VISIT_TIMING.give;

describe('Dexter at the coffee machine', () => {
  it('waits until the hero saves there', () => {
    const visit = new VisitSequence();
    expect(run(visit, 3000)).toEqual(['waiting']);
  });

  it('bows, sweats and gives once, then idles without pools', () => {
    let gifts = 0;
    const visit = new VisitSequence({ onGift: () => gifts++ });
    visit.arrive();
    expect(run(visit, FIRST + 200)).toEqual(['bow', 'sweat', 'give', 'idle']);
    visit.arrive();
    expect(run(visit, 3000)).toEqual(['idle']);
    expect(gifts).toBe(1);
  });

  it('absorbs every pool after the gift, oldest first', () => {
    const absorbed: number[] = [];
    const visit = new VisitSequence({ onAbsorb: id => absorbed.push(id) });
    visit.addPool(4);
    visit.addPool(7);
    visit.arrive();
    expect(run(visit, FIRST + 2 * VISIT_TIMING.absorb + 200)).toEqual(['bow', 'sweat', 'give', 'absorb', 'idle']);
    expect(absorbed).toEqual([4, 7]);
  });

  it('absorbs pools from later fights at the next save', () => {
    const absorbed: number[] = [];
    const visit = new VisitSequence({ onAbsorb: id => absorbed.push(id) });
    visit.arrive();
    run(visit, FIRST + 200);
    visit.addPool(1);
    visit.arrive();
    expect(run(visit, VISIT_TIMING.absorb + 200)).toEqual(['absorb', 'idle']);
    expect(absorbed).toEqual([1]);
  });

  it('ignores a second save while he is busy', () => {
    let gifts = 0;
    const visit = new VisitSequence({ onGift: () => gifts++ });
    visit.arrive();
    visit.update(VISIT_TIMING.bow + 100);
    visit.arrive();
    expect(visit.phase).toBe('sweat');
    run(visit, FIRST);
    expect(gifts).toBe(1);
  });

  it('pairs a machine with the nearest Dexter spawn in reach', () => {
    // Rusty Creek rc-1-0: coffee-1 at (1770, 457) 40×80, dexter-1 at (1820, 537).
    const machine = { x: 1770, y: 457, w: 40, h: 80 };
    const near = { id: 'dexter-1', x: 1820, y: 537 };
    const far = { id: 'dexter-2', x: 1640 + 2160, y: 565 };
    expect(dexterFor(machine, [far, near])).toBe(near);
    expect(dexterFor(machine, [far])).toBeUndefined();
  });
});
