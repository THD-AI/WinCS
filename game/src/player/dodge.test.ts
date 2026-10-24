import { describe, expect, it } from 'vitest';
import { Dodge, DODGE_COOLDOWN, DODGE_DISTANCE, DODGE_INVULNERABLE, DODGE_TIME } from './dodge';
import { RUN_SPEED } from './movement';

const run = (dodge: Dodge, seconds: number) => {
  let moved = 0;
  for (let t = 0; t < seconds - 1e-9; t += 1 / 120) moved += dodge.step(1 / 120);
  return moved;
};

describe('the dodge-dash', () => {
  it('covers 120 px in 0.2 s – a quick burst well past the run', () => {
    expect(DODGE_DISTANCE).toBeGreaterThanOrEqual(110); expect(DODGE_DISTANCE).toBeLessThanOrEqual(130);
    expect(DODGE_DISTANCE / DODGE_TIME).toBeGreaterThan(2 * RUN_SPEED);
    const dodge = new Dodge(); expect(dodge.start(-1, true)).toBe(true);
    expect(run(dodge, 0.3)).toBeCloseTo(-DODGE_DISTANCE, 6); expect(dodge.active).toBe(false);
  });

  it('is untouchable for most of the dash, not its last frames', () => {
    const dodge = new Dodge(); dodge.start(1, true);
    expect(dodge.invulnerable).toBe(true);
    run(dodge, DODGE_INVULNERABLE - 0.01); expect(dodge.invulnerable).toBe(true);
    run(dodge, 0.02); expect(dodge.active).toBe(true); expect(dodge.invulnerable).toBe(false);
    expect(DODGE_INVULNERABLE / DODGE_TIME).toBeGreaterThanOrEqual(0.75);
  });

  it('waits out the cooldown after a dash, and a cancelled dash too', () => {
    const dodge = new Dodge(); dodge.start(1, true); run(dodge, DODGE_TIME);
    expect(dodge.start(1, true)).toBe(false);
    run(dodge, DODGE_COOLDOWN - 0.02); expect(dodge.start(1, true)).toBe(false);
    run(dodge, 0.03); expect(dodge.start(1, true)).toBe(true);
    dodge.cancel(); expect(dodge.active).toBe(false); expect(dodge.invulnerable).toBe(false);
    expect(dodge.start(1, true)).toBe(false); expect(dodge.step(1 / 120)).toBe(0);
  });

  it('dashes once per jump in the air and gets it back on landing', () => {
    const dodge = new Dodge();
    expect(dodge.start(1, false)).toBe(true); run(dodge, DODGE_TIME + DODGE_COOLDOWN + 0.05);
    expect(dodge.start(1, false)).toBe(false);
    dodge.land(); expect(dodge.start(1, false)).toBe(true);
  });

  it('a ground dash off a ledge still leaves the air dash', () => {
    const dodge = new Dodge(); dodge.start(1, true); run(dodge, DODGE_TIME + DODGE_COOLDOWN + 0.05);
    expect(dodge.start(-1, false)).toBe(true); expect(dodge.direction).toBe(-1);
  });
});
