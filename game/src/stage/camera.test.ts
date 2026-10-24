import { describe, expect, it } from 'vitest';
import { follow, gridBounds } from './camera';
import type { StageManifest } from './manifest';
const bounds = { x: 0, y: 0, width: 6480, height: 1440 };
describe('camera follow', () => {
  it('leads in the move direction and smoothly follows vertical changes', () => {
    const state = { x: 1000, y: 0, lead: 0 };
    const first = follow(state, { x: 2000, y: 1000, vx: 258 }, bounds, 1 / 60);
    expect(first.x).toBeGreaterThan(1000); expect(first.y).toBeGreaterThan(0); expect(first.y).toBeLessThan(539);
    for (let i = 0; i < 240; i++) follow(state, { x: 2000, y: 1000, vx: 258 }, bounds, 1 / 60);
    expect(state.lead).toBeCloseTo(120); expect(state.x).toBeCloseTo(1480, 0);
    for (let i = 0; i < 240; i++) follow(state, { x: 2000, y: 1000, vx: -258 }, bounds, 1 / 60);
    expect(state.lead).toBeCloseTo(-120); expect(state.x).toBeCloseTo(1240, 0);
  });
  it('clamps all edges and returns whole pixels, including negative chunks', () => {
    const negative = { x: -2160, y: -720, width: 6480, height: 2160 };
    for (const value of [-10000, 10000]) {
      const state = { x: value, y: value, lead: 0 };
      const result = follow(state, { x: value, y: value, vx: 258 }, negative, 0.1);
      expect(Number.isInteger(result.x)).toBe(true); expect(Number.isInteger(result.y)).toBe(true);
      expect(result.x).toBeGreaterThanOrEqual(-2160); expect(result.x).toBeLessThanOrEqual(3040);
      expect(result.y).toBeGreaterThanOrEqual(-720); expect(result.y).toBeLessThanOrEqual(720);
    }
  });
  it('derives bounds from a four-direction chunk grid', () => {
    const manifest = { chunkSize: [2160, 720], chunks: [{ x: -1, y: -1 }, { x: 1, y: 1 }] } as StageManifest;
    expect(gridBounds(manifest)).toEqual({ x: -2160, y: -720, width: 6480, height: 2160 });
  });
  it('keeps static vertical follow independent of rendered frame rate', () => {
    const run = (fps: number) => {
      const state = { x: 0, y: 0, lead: 0 };
      for (let i = 0; i < fps; i++) follow(state, { x: 2000, y: 1000, vx: 0 }, bounds, 1 / fps);
      return state;
    };
    expect(run(30).x).toBeCloseTo(run(120).x, 7); expect(run(30).y).toBeCloseTo(run(120).y, 7);
  });
});
