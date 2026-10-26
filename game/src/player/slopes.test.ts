import { describe, expect, it } from 'vitest';
import { stepBody, type Body } from './body';
import { jump, jumpState } from './jump';
import type { CollisionData, Geometry, Point } from '../stage/collision';
import { placeCollision } from '../stage/collision';
const terrain = (walk: Point[][], slide: Point[][] = []): Geometry => ({ walk, slide, oneWay: [], solid: [],
  climb: [], noGo: [], hazard: [], interact: [], spawn: [], ledge: [], glideLift: [] });
const body = (x: number, y: number, vx = 150.5): Body => ({ x, y, vx, vy: 0, grounded: true });
describe('continuous slope contacts', () => {
  it('follows uphill, crest and downhill without gaps at walk and run speeds', () => {
    const world = terrain([[[0, 500], [150, 400], [300, 500], [600, 500]]]);
    for (const speed of [150.5, 258]) {
      const b = body(50, 500 - 50 * 2 / 3, speed);
      for (let i = 0; i < 180; i++) {
        stepBody(b, [world], 1 / 120);
        expect(b.grounded).toBe(true); expect(b.sliding).toBe(false);
        const expected = b.x < 150 ? 500 - b.x * 2 / 3 : b.x < 300 ? 400 + (b.x - 150) * 2 / 3 : 500;
        expect(b.y).toBeCloseTo(expected, 7);
      }
    }
  });
  it('walks exactly 40 degrees and slides above it in both directions', () => {
    const s40 = Math.tan(40 * Math.PI / 180);
    const b = body(10, 100 + 10 * s40);
    stepBody(b, [terrain([[[0, 100], [100, 100 + 100 * s40]]])], 1 / 120);
    expect(b.sliding).toBe(false);
    for (const sign of [-1, 1]) {
      const world = terrain([], [[[0, sign < 0 ? 500 : 100], [200, sign < 0 ? 100 : 500]]]);
      const b = body(100, 300, 0);
      for (let i = 0; i < 30; i++) stepBody(b, [world], 1 / 120);
      expect(b.sliding).toBe(true); expect(Math.sign(b.vx)).toBe(sign);
      expect(Math.abs(b.vx)).toBeGreaterThan(100);
      jump(b, jumpState(b.y), true, 1 / 120);
      stepBody(b, [world], 1 / 120);
      expect(b.vy).toBeLessThan(0); expect(b.grounded).toBe(false);
    }
  });
  it('does not magnetize a jumping body back onto the slope', () => {
    const b = { ...body(100, 400), grounded: false, vy: -100 };
    stepBody(b, [terrain([[[0, 500], [500, 250]]])], 1 / 120);
    expect(b.grounded).toBe(false); expect(b.y).toBeLessThan(400);
  });
  it('uses real authored Rusty Creek walk segments at both speeds', () => {
    const files = import.meta.glob<CollisionData>('../../../art/stages/rusty-creek/*.collision.json', { eager: true, import: 'default' });
    for (const world of Object.values(files)) for (const line of world.walk) for (let i = 1; i < line.length; i++) {
      const [a, z] = [line[i - 1], line[i]], slope = (z[1] - a[1]) / (z[0] - a[0]);
      for (const speed of [150.5, 258]) {
        const b = body((a[0] + z[0]) / 2, (a[1] + z[1]) / 2, speed);
        stepBody(b, [terrain([[a, z]])], 1 / 120);
        expect(b.y).toBeCloseTo(a[1] + (b.x - a[0]) * slope, 7);
        expect(b.grounded).toBe(true);
      }
    }
  });
  it('crosses the real chunk seams in both states and directions without falling through', () => {
    const files = Object.values(import.meta.glob<CollisionData>('../../../art/stages/rusty-creek/*.collision.json', { eager: true, import: 'default' }));
    // Along the creek path (the level row, y 522), where the region is walked from chunk to chunk.
    const path = (line: [number, number][]) => line[0][1] > 400;
    for (const state of ['clean', 'anomaly']) for (const column of [0, 1]) {
      const left = files.find(f => f.chunk === `rc-${column}-1` && f.state === state)!;
      const right = files.find(f => f.chunk === `rc-${column + 1}-1` && f.state === state)!;
      const geometry = [placeCollision(left, [0, 0]).world, placeCollision(right, [2160, 0]).world];
      const leftY = left.walk.filter(path).find(l => l.at(-1)![0] === 2160)!.at(-1)![1];
      const rightY = right.walk.filter(path).find(l => l[0][0] === 0)![0][1];
      for (const speed of [-258, -150.5, 150.5, 258]) {
        const b = body(speed > 0 ? 2155 : 2165, speed > 0 ? leftY : rightY, speed);
        for (let i = 0; i < 10; i++) {
          stepBody(b, geometry, 1 / 120);
          expect(b.grounded).toBe(true); expect(b.y).toBe(b.x < 2160 ? leftY : rightY);
        }
      }
    }
  });
});
