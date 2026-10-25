import { describe, expect, it } from 'vitest';
import { stepBody, type Body } from './body';
import { climb, dropThrough, fallLine, traversal } from './traversal';
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
    // Getting on plays ladder-bottom reversed first, the body waiting at the foot.
    for (let i = 1; i < Math.round(LADDER_BOTTOM_TIME / dt); i++) climb(b, state, [world], -1, 0, false, dt);
    expect(b.y).toBe(500);
    climb(b, state, [world], -1, 0, false, dt);
    expect(b.y).toBeCloseTo(500 - 70 * dt); expect(state.ladder).not.toBeNull();
    const held = b.y;
    for (let i = 0; i < 30; i++) climb(b, state, [world], 0, 0, false, dt);
    expect(b.y).toBe(held);
    for (let i = 0; i < 300; i++) climb(b, state, [world], -1, 0, false, dt);
    expect(b.y).toBe(350); expect(b.grounded).toBe(true); expect(state.ladder).toBeNull();
    // 147 px down at 70 px/s, after getting off at the top and on again (two ladder-top clips).
    for (let i = 0; i < 400; i++) climb(b, state, [world], 1, 0, false, dt);
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

import heroAir from '../../public/assets/sprites/hero-air.anims.json';
describe('the climb (Alexander, 25 Oct)', () => {
  it('alternates in its own clip, so it is never mirrored (a mirrored back reads THD as DHT)', () => {
    expect(heroAir.ladder.frames).toBe(4);
  });
});

import { LADDER_BOTTOM_TIME, LADDER_TOP_TIME, takeLadderEnd } from './traversal';
import ladderClips from '../../public/assets/sprites/hero-ladder.anims.json';
describe('getting on and off a ladder (Alexander, 24 Oct)', () => {
  const steps = (seconds: number) => Math.round(seconds / dt);
  it('holds as long as the hero-ladder clips play', () => {
    expect(LADDER_TOP_TIME).toBeCloseTo(ladderClips['ladder-top'].frames / ladderClips['ladder-top'].fps);
    expect(LADDER_BOTTOM_TIME).toBeCloseTo(ladderClips['ladder-bottom'].frames / ladderClips['ladder-bottom'].fps);
  });
  it('climbs over the top onto the deck, standing still there for the clip, and Up does not grab again', () => {
    const b = body(360), state = traversal();
    let i = 0;
    for (; i < 100 && !state.end; i++) climb(b, state, [world], -1, 0, false, dt);
    expect(b.y).toBe(350); expect(state.ladder).toBeNull(); expect(b.grounded).toBe(true);
    expect(takeLadderEnd(state)).toEqual({ clip: 'ladder-top', reverse: false });
    expect(takeLadderEnd(state)).toBeNull();
    let held = 0;
    for (let n = 0; n < 120; n++) {
      if (climb(b, state, [world], -1, 0, false, dt)) held++;
      expect(state.ladder).toBeNull(); expect(state.end).toBeNull(); expect(b.y).toBe(350);
    }
    expect(held).toBe(steps(LADDER_TOP_TIME));
  });
  it('steps off the bottom onto the ground and Down does not grab again', () => {
    const b = body(490), state = traversal();
    for (let i = 0; i < 100 && !state.end; i++) climb(b, state, [world], 1, 0, false, dt);
    expect(b.y).toBe(500); expect(takeLadderEnd(state)).toEqual({ clip: 'ladder-bottom', reverse: false });
    let held = 0;
    for (let n = 0; n < 120; n++) if (climb(b, state, [world], 1, 0, false, dt)) held++;
    expect(held).toBe(steps(LADDER_BOTTOM_TIME)); expect(state.ladder).toBeNull(); expect(state.end).toBeNull();
  });
  it('gets on from the deck with ladder-top reversed and from the ground with ladder-bottom reversed', () => {
    for (const [y, vertical, clip, time] of [[350, 1, 'ladder-top', LADDER_TOP_TIME], [500, -1, 'ladder-bottom', LADDER_BOTTOM_TIME]] as const) {
      const b = body(y), state = traversal();
      expect(climb(b, state, [world], vertical, 0, false, dt)).toBe(true);
      expect(takeLadderEnd(state)).toEqual({ clip, reverse: true }); expect(state.ladder).not.toBeNull();
      // The body waits at the end while the clip plays (and while no direction is held), then climbs.
      for (let n = 0; n < 30; n++) climb(b, state, [world], 0, 0, false, dt);
      for (let n = 1; n < steps(time); n++) climb(b, state, [world], vertical, 0, false, dt);
      expect(b.y).toBe(y);
      climb(b, state, [world], vertical, 0, false, dt); climb(b, state, [world], vertical, 0, false, dt);
      expect(b.y).not.toBe(y);
    }
  });
  it('a jump ends the hold at either end at once', () => {
    const b = body(355), state = traversal();
    for (let i = 0; i < 100 && !state.end; i++) climb(b, state, [world], -1, 0, false, dt);
    expect(climb(b, state, [world], 0, 0, true, dt)).toBe(false); expect(state.hold).toBe(0);
    const on = body(350), entering = traversal();
    climb(on, entering, [world], 1, 0, false, dt);
    expect(climb(on, entering, [world], 0, 0, true, dt)).toBe(false);
    expect(entering.ladder).toBeNull(); expect(entering.hold).toBe(0);
  });
  it('grabbing mid-ladder plays no end clip', () => {
    const b = body(420), state = traversal();
    climb(b, state, [world], -1, 0, false, dt);
    expect(state.ladder).not.toBeNull(); expect(state.end).toBeNull(); expect(b.y).toBeLessThan(420);
  });
});

describe('falling out of the region', () => {
  it('is below the lowest row: y 900 for one row, 1620 with a row of rooms under it', () => {
    expect(fallLine([{ origin: [0, 0] }, { origin: [2160, 0] }])).toBe(900);
    expect(fallLine([{ origin: [0, 0] }, { origin: [4320, 720] }])).toBe(1620);
  });
});
