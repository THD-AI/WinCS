import { describe, expect, it } from 'vitest';
import { LOW_CONTACT, LOW_POSES, LowSweep } from './lowSweep';
import { SWEEP_CONTACT, type Damageable } from './sweeps';
import atlas from '../../public/assets/sprites/chair-overhead.json';

describe('the low sweep (↓ + Act on the ground)', () => {
  const feet = { x: 100, y: 500 };
  const target = (id: string, x: number, h: number, log: string[]): Damageable =>
    ({ id, bounds: () => ({ x, y: 500 - h, w: 30, h }), hit: () => { log.push(id); return true; } });

  it('reuses existing chair-overhead poses only', () => {
    for (const pose of LOW_POSES) expect(Object.keys(atlas.frames)).toContain(pose);
  });

  it('strikes along the floor only while the chair is down, once per target, and ends after five poses', () => {
    const low = new LowSweep(), log: string[] = [];
    expect(low.begin(1)).toBe(true); expect(low.begin(-1)).toBe(false);
    expect(low.box(feet)).toBeNull(); expect(low.pose).toBe('slam-02');
    low.step(1 / 12);
    expect(low.box(feet)).toEqual({ x: 112, y: 449, w: 63, h: 51 });
    expect(low.hit(feet, [target('rover', 140, 25, log), target('crab', 150, 12, log)])).toHaveLength(2);
    low.step(1 / 12); expect(low.hit(feet, [target('rover', 140, 25, log)])).toHaveLength(0);
    low.step(1 / 12); expect(low.box(feet)).toBeNull();
    low.step(2 / 12); expect(low.active).toBe(false); expect(low.pose).toBeUndefined();
    expect(log).toEqual(['rover', 'crab']);
  });

  it('mirrors to the left, reaches past the side swing, and leaves a drone overhead alone', () => {
    const low = new LowSweep(), log: string[] = [];
    low.begin(-1); low.step(1 / 12);
    expect(low.box(feet)).toEqual({ x: 25, y: 449, w: 63, h: 51 });
    expect(LOW_CONTACT.reach).toBeGreaterThan(SWEEP_CONTACT.reach);
    const drone: Damageable = { id: 'drone', bounds: () => ({ x: 50, y: 380, w: 45, h: 45 }), hit: () => { log.push('drone'); return true; } };
    expect(low.hit(feet, [drone])).toHaveLength(0);
  });
});
