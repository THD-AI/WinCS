import { describe, expect, it } from 'vitest';
import { ASSIST, Lunge, pickAssist } from './assist';
import { SWEEP_CONTACT } from './sweeps';
import { LOW_CONTACT } from './lowSweep';

const feet = { x: 100, y: 500 };
const rover = (x: number) => ({ x, y: 475, w: 31, h: 25 });

describe('chair target assist (subtle: turn, nudge, up under a drone)', () => {
  it('leaves an enemy already in reach alone, and nudges toward one just out of reach (at most 24 px)', () => {
    expect(pickAssist(feet, 1, [rover(130)], 'sweep')).toMatchObject({ direction: 1, turn: false, lunge: 0, up: false });
    const near = pickAssist(feet, 1, [rover(155)], 'sweep')!;
    expect(near.lunge).toBeCloseTo(55 - (SWEEP_CONTACT.reach - ASSIST.margin));
    const edge = pickAssist(feet, 1, [rover(100 + 1.3 * SWEEP_CONTACT.reach)], 'sweep')!;
    expect(edge.lunge).toBeCloseTo(1.3 * SWEEP_CONTACT.reach - (SWEEP_CONTACT.reach - ASSIST.margin)); expect(edge.lunge).toBeLessThanOrEqual(ASSIST.lunge);
    expect(pickAssist(feet, 1, [rover(100 + 1.3 * SWEEP_CONTACT.reach + 1)], 'sweep')).toBeUndefined();
  });

  it('turns to an enemy just behind (within 40 px), not one further back', () => {
    expect(pickAssist(feet, 1, [rover(100 - 30 - 31)], 'sweep')).toMatchObject({ direction: -1, turn: true, lunge: 0 });
    expect(pickAssist(feet, 1, [rover(100 - 41 - 31)], 'sweep')).toBeUndefined();
  });

  it('picks the nearest, preferring the one ahead on a tie', () => {
    expect(pickAssist(feet, 1, [rover(160), rover(130)], 'sweep')!.target.x).toBe(130);
    expect(pickAssist(feet, -1, [rover(130), rover(100 - 30 - 31)], 'sweep')!.direction).toBe(-1);
    expect(pickAssist(feet, 1, [rover(130), rover(100 - 30 - 31)], 'sweep')!.direction).toBe(1);
  });

  it('ignores enemies more than a body height above or below', () => {
    expect(pickAssist(feet, 1, [{ x: 120, y: 300, w: 30, h: 40 }], 'sweep')).toBeUndefined();
    expect(pickAssist(feet, 1, [{ x: 120, y: 590, w: 30, h: 25 }], 'sweep')).toBeUndefined();
  });

  it('makes a plain tap under a hovering drone the up attack, and never nudges it', () => {
    const drone = { x: 100, y: 355, w: 45, h: 45 }; // 100–145 px above the feet: the Rusty Creek ground
    expect(pickAssist(feet, 1, [drone], 'sweep')).toMatchObject({ up: true, lunge: 0 });
    expect(pickAssist(feet, -1, [drone], 'up')).toMatchObject({ up: true, direction: 1, turn: true });
    const low = { x: 120, y: 434, w: 45, h: 45 }; // at head height: the side swing reaches it
    expect(pickAssist(feet, 1, [low], 'sweep')!.up).toBe(false);
    expect(pickAssist(feet, 1, [drone], 'low')).toBeUndefined();
  });

  it('measures the low sweep against its own longer reach', () => {
    expect(pickAssist(feet, 1, [rover(150)], 'low', LOW_CONTACT.reach)!.lunge).toBe(0);
    expect(pickAssist(feet, 1, [rover(150)], 'sweep')!.lunge).toBeGreaterThan(0);
  });

  it('spreads the nudge evenly over 0.1 s', () => {
    const lunge = new Lunge(); lunge.start(-20); let moved = 0;
    for (let i = 0; i < 24; i++) moved += lunge.step(1 / 120);
    expect(moved).toBeCloseTo(-20); expect(lunge.remaining).toBe(0);
    lunge.start(10); lunge.cancel(); expect(lunge.step(1 / 120)).toBe(0);
  });
});
