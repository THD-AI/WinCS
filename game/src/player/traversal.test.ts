import { describe, expect, it } from 'vitest';
import { stepBody, type Body } from './body';
import { climb, dropThrough, traversal } from './traversal';
import type { CollisionData, Geometry } from '../stage/collision';
const dt = 1 / 120;
const world: Geometry = { walk: [[[0, 500], [1000, 500]]], slide: [], oneWay: [[[100, 350], [300, 350]]],
  climb: [{ x: 180, y: 353, w: 30, h: 147, kind: 'ladder' }], solid: [],
  noGo: [], hazard: [], interact: [], spawn: [], ledge: [], glideLift: [] };
const body = (y: number): Body => ({ x: 195, y, vx: 0, vy: 0, grounded: true });
describe('vertical traversal', () => {
  it('jumps upward through yellow lines and lands on top when falling', () => {
    const b = { ...body(400), grounded: false, vy: -485 };
    let crossed = false;
    for (let i = 0; i < 120; i++) {
      stepBody(b, [world], dt); if (b.y < 350) crossed = true;
    }
    expect(crossed).toBe(true); expect(b.y).toBe(350); expect(b.grounded).toBe(true);
  });
  it('drops through a yellow support without disabling the green floor', () => {
    const b = body(350), state = traversal();
    expect(dropThrough(b, state, [world])).toBe(true);
    for (let i = 0; i < 120; i++) {
      climb(b, state, [world], 0, 0, false, dt);
      stepBody(b, [world], dt, state.drop > 0);
    }
    expect(b.y).toBe(500); expect(dropThrough(b, state, [world])).toBe(false);
  });
  it('handles Down slightly before Jump at a ladder top without grabbing it again', () => {
    const b = body(350), state = traversal();
    climb(b, state, [world], 1, 0, false, dt);
    expect(state.ladder).not.toBeNull();
    expect(dropThrough(b, state, [world])).toBe(true);
    expect(climb(b, state, [world], 1, 0, true, dt)).toBe(false);
    expect(state.ladder).toBeNull();
  });
  it('climbs slowly, holds position on release, and exits at the deck height', () => {
    const b = body(500), state = traversal();
    expect(climb(b, state, [world], -1, 0, false, dt)).toBe(true);
    expect(b.y).toBeCloseTo(500 - 70 * dt); expect(state.ladder).not.toBeNull();
    const held = b.y;
    for (let i = 0; i < 30; i++) climb(b, state, [world], 0, 0, false, dt);
    expect(b.y).toBe(held);
    for (let i = 0; i < 300; i++) climb(b, state, [world], -1, 0, false, dt);
    expect(b.y).toBe(350); expect(b.grounded).toBe(true); expect(state.ladder).toBeNull();
    for (let i = 0; i < 300; i++) climb(b, state, [world], 1, 0, false, dt);
    expect(b.y).toBe(500); expect(state.ladder).toBeNull();
  });
  it('releases a ladder on horizontal input or jump and ignores reserved ledges', () => {
    for (const jumping of [false, true]) {
      const b = body(400), state = traversal(); climb(b, state, [world], -1, 0, false, dt);
      expect(climb(b, state, [world], 0, jumping ? 0 : 1, jumping, dt)).toBe(false);
      expect(state.ladder).toBeNull(); expect(b.grounded).toBe(jumping);
      expect(climb(b, state, [world], -1, 0, false, dt)).toBe(false);
    }
    const b = body(400), state = traversal();
    climb(b, state, [{ ...world, climb: [], ledge: [{ x: 195, y: 400 }] }], -1, 0, false, dt);
    expect(state.ladder).toBeNull();
  });
  it('traverses every authored Creek climb zone in both directions', () => {
    const files = import.meta.glob<CollisionData>('../../../art/stages/rusty-creek/*.collision.json', { eager: true, import: 'default' });
    for (const source of Object.values(files)) for (const box of source.climb) {
      const b = { ...body(box.y + box.h), x: box.x + box.w / 2 }, state = traversal();
      const geometry = { ...source, climb: [box] };
      for (let i = 0; i < 1500; i++) climb(b, state, [geometry], -1, 0, false, dt);
      expect(b.y).toBeGreaterThanOrEqual(box.y - 8); expect(b.y).toBeLessThanOrEqual(box.y + 8);
      for (let i = 0; i < 1500; i++) climb(b, state, [geometry], 1, 0, false, dt);
      expect(b.y).toBeGreaterThanOrEqual(box.y + box.h - 8); expect(b.y).toBeLessThanOrEqual(box.y + box.h + 8);
    }
  });
});
