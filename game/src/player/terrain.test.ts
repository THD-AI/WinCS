import { describe, expect, it } from 'vitest';
import { faces, heightAt, overlaps, stepBody, STEP_UP, type Body } from './body';
import { jump, jumpState } from './jump';
import { WALK_SPEED, RUN_SPEED } from './movement';
import { parseCollision, placeCollision, terrainAt, type Box, type CollisionData, type Geometry, type Point } from '../stage/collision';

const world = (walk: Point[][], extra: Partial<Geometry> = {}): Geometry => ({ walk, slide: [], oneWay: [], solid: [],
  climb: [], noGo: [], hazard: [], interact: [], spawn: [], ledge: [], glideLift: [], ...extra });
const body = (x: number, y: number, vx = WALK_SPEED): Body => ({ x, y, vx, vy: 0, grounded: true });
const run = (b: Body, geometry: Geometry[], steps: number, vx = b.vx) => {
  for (let i = 0; i < steps; i++) { b.vx = vx; stepBody(b, geometry, 1 / 120); }
  return b;
};

describe('terrain: steps, ledges, walls, treads', () => {
  it('walks up and down a rise of STEP_UP or less without leaving the ground', () => {
    for (const rise of [4, 10, STEP_UP]) {
      const g = [world([[[0, 300], [100, 300]], [[100, 300 - rise], [200, 300 - rise]], [[200, 300], [300, 300]]])];
      const b = body(50, 300);
      for (let i = 0; i < 260; i++) { run(b, g, 1); expect(b.grounded).toBe(true); expect(b.sliding).toBe(false); }
      expect(b.x).toBeGreaterThan(200); expect(b.y).toBe(300);
    }
  });
  it('stops at a ledge face taller than a step, and the jump gets on top of it', () => {
    const g = [world([[[0, 300], [100, 300]], [[100, 260], [300, 260]]])];
    expect(faces(g)).toEqual(expect.arrayContaining([{ x: 100, top: 260, side: -1 }]));
    const b = run(body(50, 300), g, 120);
    expect(b.x).toBe(100 - 14); expect(b.y).toBe(300); expect(b.grounded).toBe(true);
    const air = jumpState(b.y);
    for (let i = 0; i < 120; i++) { jump(b, air, i < 40, 1 / 120); b.vx = WALK_SPEED; stepBody(b, g, 1 / 120); }
    expect(b.x).toBeGreaterThan(100); expect(b.y).toBe(260); expect(b.grounded).toBe(true);
  });
  it('walks on in front of a raised platform the trail runs under (the bench), and falls off a high ledge', () => {
    const g = [world([[[0, 300], [400, 300]], [[100, 260], [200, 260]]])];
    expect(faces(g).some(f => f.top === 260)).toBe(false);
    const b = run(body(50, 300), g, 400);
    expect(b.x).toBeGreaterThan(250); expect(b.y).toBe(300);
    const down = run(body(150, 260), g, 120);
    expect(down.y).toBe(300); expect(down.grounded).toBe(true);
  });
  it('climbs a stair of flat treads as steps: flat slope, never a slide, always on a tread', () => {
    const treads: Point[][] = Array.from({ length: 6 }, (_, i) => [[i * 30, 300 - i * 12], [i * 30 + 30, 300 - i * 12]]);
    const g = [world(treads)];
    const b = body(10, 300, RUN_SPEED);
    for (let i = 0; i < 100 && b.x < 175; i++) {
      run(b, g, 1);
      expect(b.grounded).toBe(true); expect(b.slope).toBe(0); expect(b.sliding).toBe(false);
      expect(treads.some(t => heightAt(t, b.x)?.y === b.y)).toBe(true);
    }
    expect(b.y).toBe(240);
  });
  it('lands on a stepping stone whose edge is under the feet but not under the centre', () => {
    const g = [world([[[100, 300], [160, 300]]])];
    const b: Body = { x: 94, y: 280, vx: 0, vy: 200, grounded: false };
    for (let i = 0; i < 30; i++) stepBody(b, g, 1 / 120);
    expect(b.grounded).toBe(true); expect(b.y).toBe(300);
    const off: Body = { x: 80, y: 280, vx: 0, vy: 200, grounded: false };
    for (let i = 0; i < 30; i++) stepBody(off, g, 1 / 120);
    expect(off.grounded).toBe(false);
  });
  it('slides only on authored slide lines', () => {
    const steep: Point[] = [[0, 100], [200, 260]];
    const walking = run(body(100, 180, 0), [world([steep])], 30, 0);
    expect(walking.sliding).toBe(false); expect(walking.x).toBe(100);
    const sliding = body(100, 180, 0);
    for (let i = 0; i < 30; i++) stepBody(sliding, [world([], { slide: [steep] })], 1 / 120);
    expect(sliding.sliding).toBe(true); expect(sliding.x).toBeGreaterThan(100);
  });
  it('stops at a wall and a log, steps onto a low solid, stands on top of the log after a jump', () => {
    const log: Box = { x: 200, y: 250, w: 100, h: 50, kind: 'log' };
    const kerb: Box = { x: 100, y: 290, w: 40, h: 10, kind: 'obstacle' };
    const g = [world([[[0, 300], [500, 300]]], { solid: [kerb, log] })];
    const b = run(body(50, 300), g, 240);
    expect(b.x).toBe(200 - 14); expect(b.y).toBe(300);
    const kerbed = run(body(80, 300), g, 30);
    expect(kerbed.y === 290 || kerbed.x > 140 + 14).toBe(true);
    const air = jumpState(b.y);
    for (let i = 0; i < 120; i++) { jump(b, air, i < 40, 1 / 120); b.vx = WALK_SPEED; stepBody(b, g, 1 / 120); }
    expect(b.y).toBe(250); expect(b.x).toBeGreaterThan(200);
  });
});

const files = import.meta.glob<CollisionData>('../../../art/stages/hidden-garden/*.collision.json', { eager: true, import: 'default' });
// Placed by grid id (hg-<col>-<row>); the walks below are the level row's – the cellar row under it has its own test.
const grid = (chunk: string) => chunk.split('-').slice(1).map(Number) as [number, number];
const placed = Object.values(files).map(data => placeCollision(parseCollision(data, data.chunk, 'clean'),
  [grid(data.chunk)[0] * 2160, grid(data.chunk)[1] * 720]));
const garden = placed.filter(c => c.origin[1] === 0).sort((a, b) => a.origin[0] - b.origin[0]);
const below = placed.filter(c => c.origin[1] === 720).sort((a, b) => a.origin[0] - b.origin[0]);
const geometry = garden.map(c => c.world);
const floorBelow = (x: number, y: number) => geometry.flatMap(g => [...g.walk, ...g.oneWay])
  .map(line => heightAt(line, x)?.y).filter((h): h is number => h !== undefined && h >= y - STEP_UP && h <= y + 130);

describe('the Hidden Garden terrain', () => {
  it('types every floor of every chunk', () => {
    for (const { local } of placed) for (const line of [...local.walk, ...local.oneWay]) for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      expect(terrainAt(local, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), `${local.chunk} ${a}->${b}`).toBeDefined();
    }
  });
  it('meets at every chunk seam within a step, walking either way', () => {
    for (let i = 1; i < garden.length; i++) {
      const seam = i * 2160;
      const left = Math.max(...geometry[i - 1].walk.map(l => heightAt(l, seam)?.y ?? -1));
      const right = Math.max(...geometry[i].walk.map(l => heightAt(l, seam)?.y ?? -1));
      expect(Math.abs(left - right)).toBeLessThanOrEqual(STEP_UP);
      for (const vx of [WALK_SPEED, -RUN_SPEED]) {
        const b = body(vx > 0 ? seam - 20 : seam + 20, vx > 0 ? left : right, vx);
        run(b, geometry, 60);
        expect(b.grounded).toBe(true);
      }
    }
  });
  it('walks the whole garden gate to pier: steps, hops onto ledges and the birch, never in the pond', () => {
    const spawn = garden[0].world.spawn.find(p => p.kind === 'player')!;
    const b = body(spawn.x, heightAt(garden[0].world.walk[0], spawn.x)!.y);
    const air = jumpState(b.y);
    let hold = 0, jumps = 0, lastX = b.x;
    const water = geometry.flatMap(g => g.noGo).filter(box => box.kind === 'water');
    for (let i = 0; i < 120 * 150 && b.x < 4 * 2160 + 1300; i++) {
      // The player: walk right; jump when stopped by a face or at the brink of a gap.
      if (b.grounded && hold === 0 && (Math.abs(b.x - lastX) < 0.01 && i > 0 || !floorBelow(b.x + 6, b.y).length)) { hold = 0.35; jumps++; }
      lastX = b.x;
      jump(b, air, hold > 0, 1 / 120);
      hold = Math.max(0, hold - 1 / 120);
      b.vx = WALK_SPEED;
      stepBody(b, geometry, 1 / 120);
      expect(water.some(box => overlaps(b, box)), `in the pond at x=${b.x.toFixed(0)}`).toBe(false);
      expect(b.y).toBeLessThan(482);
    }
    expect(b.x).toBeGreaterThanOrEqual(4 * 2160 + 1300);
    expect(jumps).toBeGreaterThanOrEqual(8);
  });
  it('walks the cellar row from the cellar to the far end of the wrong reflection, never in the water', () => {
    expect(below.map(c => c.local.chunk)).toEqual(['hg-2-1', 'hg-3-1', 'hg-4-1']);
    const rooms = below.map(c => c.world);
    const start = below[0].origin[0], end = below[2].origin[0] + 2100;
    const floor = (x: number) => Math.max(...rooms.flatMap(g => g.walk).map(l => heightAt(l, x)?.y ?? -1));
    const b = body(start + 20, floor(start + 20));
    const air = jumpState(b.y);
    let hold = 0, lastX = b.x;
    const water = rooms.flatMap(g => g.noGo);
    for (let i = 0; i < 120 * 120 && b.x < end; i++) {
      if (b.grounded && hold === 0 && Math.abs(b.x - lastX) < 0.01 && i > 0) hold = 0.35;
      lastX = b.x;
      jump(b, air, hold > 0, 1 / 120);
      hold = Math.max(0, hold - 1 / 120);
      b.vx = WALK_SPEED;
      stepBody(b, rooms, 1 / 120);
      expect(water.some(box => overlaps(b, box)), `in the water at x=${b.x.toFixed(0)}`).toBe(false);
      expect(b.y, `fell through at x=${b.x.toFixed(0)}`).toBeLessThan(1440);
    }
    expect(b.x).toBeGreaterThanOrEqual(end);
  });
  it('the birch is a log to jump, not a hill: the slab walker stops at it', () => {
    const b = run(body(1600, 446), geometry, 120);
    expect(b.x).toBe(1630 - 14); expect(b.y).toBe(446);
  });
  it('the old 71 px step in hg-3-0 is a wall face you jump: the stone walker stops at it', () => {
    const b = run(body(3 * 2160 + 1050, 462), geometry, 120);
    expect(b.x).toBe(3 * 2160 + 1077 - 14); expect(b.y).toBe(462); expect(b.grounded).toBe(true);
  });
});
