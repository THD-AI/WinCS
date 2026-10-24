import { describe, expect, it } from 'vitest';
import { BUFFER, jump, jumpState, landing, LANDING_TIMES } from './jump';
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
  /** Simulates 120 Hz substeps with the key held on the given 120 Hz ticks; returns launch ticks and apex ticks. */
  const spam = (held: (tick: number) => boolean, ticks = 480, vx = 0) => {
    const b = { ...body(), vx }, state = jumpState(b.y);
    const launches: number[] = [], apexes: number[] = [], landings: number[] = [], presses: number[] = [];
    for (let i = 0; i < ticks; i++) {
      const before = b.vy;
      if (held(i) && !(i > 0 && held(i - 1))) presses.push(i);
      jump(b, state, held(i), dt);
      if (b.vy === -485 && before !== -485) launches.push(i);
      const grounded = b.grounded; stepBody(b, [floor], dt); landing(b, state, grounded, dt);
      if (before < 0 && b.vy >= 0 && !b.grounded) apexes.push(i);
      if (!grounded && b.grounded) landings.push(i);
    }
    return { launches, apexes, landings, presses, state };
  };
  /** Every press that is on the ground, or within the buffer before a touchdown, launches – the buffered ones on the next tick. */
  const noneSwallowed = ({ launches, landings, presses }: ReturnType<typeof spam>) => {
    let checked = 0;
    for (const land of landings) {
      const last = presses.filter(p => p <= land).at(-1);
      if (last !== undefined && land - last < BUFFER * 120 - 1) { expect(launches).toContain(land + 1); checked++; }
    }
    return checked;
  };
  it('jump spam: every tap on the ground or buffered before landing launches, at once', () => {
    // Tap (2 frames at 60 Hz = 4 ticks) every 0.25 s: each tap either finds the ground or is buffered.
    const run = spam(i => i % 30 < 4);
    expect(run.launches.length).toBeGreaterThanOrEqual(8);
    noneSwallowed(run);
  });
  it('jump spam: a tap hop rises crisply to its 52 px and does not float', () => {
    const { apexes, launches, state } = spam(i => i < 4, 120);
    expect(launches).toEqual([0]);
    expect(apexes[0] * dt).toBeLessThan(0.2); // was ~0.29 s with the clamped rise
    expect(state.height).toBeGreaterThanOrEqual(50); expect(state.height).toBeLessThan(58);
  });
  it('jump spam: mashing faster than the hop never swallows a press that comes within the buffer of touchdown', () => {
    let checked = 0;
    for (const period of [10, 14, 18, 22, 26, 34]) checked += noneSwallowed(spam(i => i % period < 2, 900));
    expect(checked).toBeGreaterThan(20);
  });
  it('lands a moving hero on its crouch only, and a walk-off step without a landing', () => {
    const run = { ...body(), vx: 198 }, state = jumpState(400);
    state.active = true; landing(run, state, false, dt);
    expect(state.landing).toBeCloseTo(LANDING_TIMES.soft / 2);
    const step = { ...body(), vx: 95 }, walkOff = jumpState(494);
    landing(step, walkOff, false, dt); expect(walkOff.landing).toBe(0);
    const stand = body(), still = jumpState(450); landing(stand, still, false, dt);
    expect(still.landing).toBe(LANDING_TIMES.soft);
  });
  it('selects the hard landing after a fall of at least two body heights', () => {
    const b = body(), state = jumpState(300);
    landing(b, state, false, dt); expect(state.hard).toBe(true); expect(state.landing).toBe(4 / 12);
    state.peak = 450; landing(b, state, false, dt); expect(state.hard).toBe(false);
  });
});
