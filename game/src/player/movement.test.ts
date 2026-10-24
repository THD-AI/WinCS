import { describe, expect, it } from 'vitest';
import { horizontal, move, movement, RUN_SPEED, WALK_SPEED } from './movement';
import { stepBody, type Body } from './body';
import type { Geometry } from '../stage/collision';

describe('walk/run controls', () => {
  it('reaches walking speed before 0.4s and then running speed', () => {
    const state = movement();
    for (let i = 0; i < 20; i++) move(state, 1, 1 / 60);
    expect(state.vx).toBe(WALK_SPEED);
    for (let i = 0; i < 10; i++) move(state, 1, 1 / 60);
    expect(state.vx).toBe(RUN_SPEED);
  });
  it('decelerates to rest and resets run timing on release or reversal', () => {
    const state = movement();
    for (let i = 0; i < 60; i++) move(state, 1, 1 / 60);
    move(state, 0, 1 / 60);
    expect(state.vx).toBeGreaterThan(0); expect(state.vx).toBeLessThan(RUN_SPEED);
    for (let i = 0; i < 10; i++) move(state, 0, 1 / 60);
    expect(state.vx).toBe(0); expect(state.held).toBe(0);
    move(state, -1, 1 / 60);
    expect(state.facing).toBe(-1); expect(state.held).toBeCloseTo(1 / 60);
    move(state, 1, 1 / 60); expect(state.held).toBeCloseTo(1 / 60);
  });
  it('handles keyboard opposites, stick dead zone and D-pad priority', () => {
    expect(horizontal(true, false)).toBe(-1); expect(horizontal(false, true)).toBe(1);
    expect(horizontal(true, true, 1)).toBe(0); expect(horizontal(false, false, 0.19)).toBe(0);
    expect(horizontal(false, false, -1)).toBe(-1); expect(horizontal(false, false, 0.6)).toBeCloseTo(0.5);
    expect(horizontal(false, false, 1, true)).toBe(-1);
  });
  it('is consistent across rendered frame rates', () => {
    const run = (fps: number) => {
      const state = movement(); let x = 0;
      for (let i = 0; i < fps; i++) { move(state, 1, 1 / fps); x += state.vx / fps; }
      return x;
    };
    expect(Math.abs(run(60) - run(120))).toBeLessThan(3);
  });
});

describe('body foundation', () => {
  const world: Geometry = { walk: [[[0, 500], [1000, 500]]], slide: [], oneWay: [], solid: [],
    climb: [], noGo: [], hazard: [], interact: [], spawn: [], ledge: [], glideLift: [] };
  it('keeps feet on the authored floor and catches a fall', () => {
    const body: Body = { x: 100, y: 450, vx: 150, vy: 0, grounded: false };
    for (let i = 0; i < 60; i++) stepBody(body, [world], 1 / 120);
    expect(body.y).toBe(500); expect(body.grounded).toBe(true); expect(body.x).toBeCloseTo(175);
  });
  it('stops the 28px body at a swept wall and lands on box tops', () => {
    const geometry = { ...world, solid: [{ x: 200, y: 300, w: 20, h: 200 }] };
    const body: Body = { x: 180, y: 500, vx: 258, vy: 0, grounded: true };
    stepBody(body, [geometry], 0.1); expect(body.x).toBe(186); expect(body.vx).toBe(0);
    Object.assign(body, { x: 210, y: 290, vx: 0, vy: 100 });
    stepBody(body, [geometry], 0.1); expect(body.y).toBe(300); expect(body.grounded).toBe(true);
  });
});
