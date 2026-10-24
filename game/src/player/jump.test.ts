import { describe, expect, it } from 'vitest';
import { jump, jumpState, landing } from './jump';
import { stepBody, type Body } from './body';
import type { Geometry } from '../stage/collision';
const floor: Geometry = { walk: [[[0, 500], [1000, 500]]], slide: [], oneWay: [], solid: [],
  climb: [], noGo: [], hazard: [], interact: [], spawn: [], ledge: [], glideLift: [] };
const body = (): Body => ({ x: 100, y: 500, vx: 0, vy: 0, grounded: true });
const dt = 1 / 120;

describe('controlled jump', () => {
  const height = (releaseAt: number) => {
    const b = body(), state = jumpState(b.y);
    for (let i = 0; i < 160; i++) {
      jump(b, state, i < releaseAt, dt);
      const grounded = b.grounded;
      stepBody(b, [floor], dt); landing(b, state, grounded, dt);
    }
    expect(b.y).toBe(500); expect(b.grounded).toBe(true);
    return state.height;
  };
  it('gives about 52px on tap and 96px held, with intermediate control', () => {
    expect(height(2)).toBeCloseTo(52, -1);
    expect(height(120)).toBeCloseTo(96, 0);
    expect(height(25)).toBeGreaterThan(65); expect(height(25)).toBeLessThan(96);
  });
  it('allows coyote jumps for 0.1s but rejects later presses', () => {
    for (const [wait, accepted] of [[9, true], [14, false]] as const) {
      const b = body(), state = jumpState(b.y); jump(b, state, false, dt); b.grounded = false;
      for (let i = 0; i < wait; i++) jump(b, state, false, dt);
      jump(b, state, true, dt); expect(b.vy < 0).toBe(accepted);
    }
  });
  it('buffers a press just before landing, expires it, and never repeats a held jump', () => {
    for (const [wait, accepted] of [[8, true], [16, false]] as const) {
      const b = { ...body(), grounded: false }, state = jumpState(500);
      jump(b, state, true, dt);
      for (let i = 0; i < wait; i++) jump(b, state, true, dt);
      b.grounded = true; jump(b, state, true, dt); expect(b.vy < 0).toBe(accepted);
    }
    const b = body(), state = jumpState(500); let launches = 0;
    for (let i = 0; i < 240; i++) {
      jump(b, state, true, dt); if (b.vy === -485) launches++;
      const grounded = b.grounded; stepBody(b, [floor], dt); landing(b, state, grounded, dt);
    }
    expect(launches).toBe(1);
  });
  it('selects the hard landing after a fall of at least two body heights', () => {
    const b = body(), state = jumpState(300);
    landing(b, state, false, dt); expect(state.hard).toBe(true); expect(state.landing).toBe(4 / 12);
    state.peak = 450; landing(b, state, false, dt); expect(state.hard).toBe(false);
  });
});
