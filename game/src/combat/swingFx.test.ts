import { describe, expect, it } from 'vitest';
import { SWEEP_CONTACT } from './sweeps';
import { SWING, swingArc } from './swingFx';

describe('the visible swing (playtest 24 Oct: the attack read as nothing)', () => {
  const feet = { x: 100, y: 500 };
  it('is brightest on each sweep\'s contact frame and gone when idle', () => {
    expect(swingArc('sweep-a', 4, 1, feet)!.alpha).toBe(1);
    expect(swingArc('sweep-b', 3, 1, feet)!.alpha).toBe(1);
    expect(swingArc('idle', 0, 1, feet)).toBeUndefined();
    expect(swingArc('recoil', 1, 1, feet)).toBeUndefined();
    expect(swingArc('sweep-a', 0, 1, feet)).toBeUndefined();
  });

  it('covers the sweep\'s measured reach, mirrored for a left swing', () => {
    const right = swingArc('sweep-a', 4, 1, feet)!, left = swingArc('sweep-a', 4, -1, feet)!;
    const tip = (a: typeof right, angle: number) => ({ x: a.x + Math.cos(angle) * a.radius, y: a.y + Math.sin(angle) * a.radius });
    const ahead = tip(right, 0);
    expect(ahead.x - feet.x).toBeGreaterThan(SWEEP_CONTACT.inner);
    expect(ahead.x - feet.x).toBeLessThanOrEqual(SWEEP_CONTACT.reach);
    expect(feet.y - ahead.y).toBeGreaterThanOrEqual(SWEEP_CONTACT.bottom);
    expect(feet.y - ahead.y).toBeLessThanOrEqual(SWEEP_CONTACT.top);
    expect(tip(left, Math.PI).x).toBeCloseTo(feet.x - (ahead.x - feet.x));
    expect(left.start).toBeCloseTo(Math.PI - (SWING.to * Math.PI) / 180);
  });
});
