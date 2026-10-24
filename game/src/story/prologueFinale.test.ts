import { describe, expect, it } from 'vitest';
import { FINALE, FinaleSequence, knockArc, pullCurve } from './prologueFinale';

describe('the pond finale', () => {
  it('runs reveal, step, shove and fall once, then hands over to the crash', () => {
    let crashes = 0;
    const run = new FinaleSequence(() => crashes++);
    expect(run.phase).toBe('idle');
    expect(run.start()).toBe(true);
    expect(run.start()).toBe(false);
    expect(run.update(FINALE.reveal - 1)).toBe('reveal');
    expect(run.progress()).toBeGreaterThan(0.99);
    expect(run.update(1)).toBe('step');
    expect(run.update(FINALE.step)).toBe('shove');
    expect(run.update(FINALE.shove)).toBe('fall');
    expect(crashes).toBe(0);
    expect(run.update(FINALE.fall)).toBe('crash');
    run.update(10_000);
    expect(crashes).toBe(1);
  });

  it('the shove contact lands inside the 4-frame clip', () => {
    expect(FINALE.contactFrame).toBeLessThan(4);
    expect((FINALE.contactFrame * 1000) / 12).toBeLessThan(FINALE.shove);
  });
});

describe('the knock and the pull', () => {
  it('knocks the hero out over the water on an arc', () => {
    const from = { x: 100, y: 441 };
    expect(knockArc(from, 0)).toEqual({ x: 100, y: 441, angle: 0 });
    expect(knockArc(from, 0.5).y).toBeLessThan(from.y);
    expect(knockArc(from, 1).x).toBe(100 + FINALE.knockX);
  });

  it('starts slow and swallows the hero completely', () => {
    expect(pullCurve(0)).toEqual({ scale: 1, spin: 0, reach: 0 });
    expect(pullCurve(0.5).reach).toBeLessThan(0.5);
    expect(pullCurve(1).scale).toBe(0);
    expect(pullCurve(2).reach).toBe(1);
  });
});
