import { describe, expect, it } from 'vitest';
import { FALLBACK, parseSurfaces, SurfaceMap } from './surfaces';
import { blades, coverRows, Grounding, sinkTarget } from './grounding';
import { contactFrames, plantedFeet } from './footfall';
import { puffParticles } from './dust';
import { arcFrame, catalogue, clipLength, LocomotionAnimation } from './animation';
import { HurtAnimation } from './hurt';
import { JUMP_SPEED } from './jump';
import { Life } from '../combat/life';
import type { AnimationTable } from '../stage/assets';

const files = import.meta.glob('../../../art/stages/*/surfaces.json', { eager: true, import: 'default' });
const art = (path: string) => files[`../../../art/stages/${path}`];
const garden = parseSurfaces(art('hidden-garden/surfaces.json'));
const creek = parseSurfaces(art('rusty-creek/surfaces.json'));
const grid = (ids: string[]) => ({ chunkSize: [2160, 720] as [number, number],
  chunks: ids.map((id, x) => ({ id, x, y: 0, states: {} })) });
const tables = import.meta.glob<AnimationTable>('../../public/assets/sprites/hero*.anims.json', { eager: true, import: 'default' });
const table = (board: string) => Object.entries(tables).find(([p]) => p.endsWith(`/${board}.anims.json`))![1];
const clips = catalogue(Object.fromEntries(['hero-move', 'hero-run', 'hero-idle', 'hero-air'].map(b => [b, table(b)])));

describe('surfaces', () => {
  const map = new SurfaceMap(garden, grid(['hg-0-0', 'hg-1-0', 'hg-2-0', 'hg-3-0', 'hg-4-0']), 'clean');
  it('looks up the authored material by world x, chunk-local ranges and y bands', () => {
    expect(map.at(200, 460).name).toBe('stone'); // gate pavers
    expect(map.at(1200, 470).name).toBe('grass');
    expect(map.at(1600, 440).name).toBe('wood'); // birch log
    expect(map.at(2160 + 550, 449).name).toBe('earth'); // under the bridge (y band)
    expect(map.at(2160 + 550, 290).name).toBe('stone'); // the bridge above it
    expect(map.at(4320 + 1000, 146).name).toBe('wood'); // terrace roof
    expect(map.at(4320 + 1000, 304).name).toBe('stone');
    expect(map.at(8640 + 1200, 441).name).toBe('wood'); // pier
  });
  it('matches states, falls back to the default and without a file to the stone-like fallback', () => {
    const rc = new SurfaceMap(creek, grid(['rc-0-0', 'rc-1-0', 'rc-2-0']), 'anomaly');
    expect(rc.at(600, 508).name).toBe('stone'); expect(rc.at(600, 461).name).toBe('steel');
    expect(new SurfaceMap(creek, grid(['rc-0-0']), 'clean').at(600, 508).name).toBe('steel');
    expect(new SurfaceMap(null, grid(['x']), 'clean').at(0, 0)).toBe(FALLBACK);
  });
  it('rejects unknown materials and covers deeper than the sink', () => {
    expect(() => parseSurfaces({ ...garden, chunks: { a: [{ x: [0, 1], material: 'lava' }] } })).toThrow(/lava/);
    expect(() => parseSurfaces({ ...garden, materials: { ...garden.materials, grass: { sink: 1, cover: 3 } } })).toThrow(/cover/);
  });
});

describe('grounding', () => {
  const grass = garden.materials.grass, stone = garden.materials.stone;
  const input = { grounded: true, slope: 0, landing: 0, hard: false };
  it('sinks the feet by material (grass 3, stone 1), never in the air', () => {
    expect(sinkTarget({ ...input, material: grass })).toBe(3);
    expect(sinkTarget({ ...input, material: stone })).toBe(1);
    expect(sinkTarget({ ...input, material: grass, grounded: false })).toBe(0);
  });
  it('drops the lower foot onto a slope and settles a landing, hard deeper', () => {
    expect(sinkTarget({ ...input, material: stone, slope: 0.25 })).toBe(3);
    expect(sinkTarget({ ...input, material: stone, landing: 1 })).toBe(2);
    expect(sinkTarget({ ...input, material: stone, landing: 1, hard: true })).toBe(3);
    expect(sinkTarget({ ...input, material: stone, slope: 5 })).toBe(5); // capped at 4 px
  });
  it('eases between surfaces instead of popping, and lifts out at once on take-off', () => {
    const g = new Grounding();
    const offsets: number[] = [];
    for (let i = 0; i < 4; i++) offsets.push(g.update({ ...input, material: stone }, 1 / 60).offset);
    for (let i = 0; i < 30; i++) offsets.push(g.update({ ...input, material: grass }, 1 / 60).offset);
    const steps = offsets.slice(1).map((o, i) => Math.abs(o - offsets[i]));
    expect(Math.max(...steps)).toBeLessThanOrEqual(1); expect(offsets.at(-1)).toBe(3);
    expect(g.update({ ...input, material: grass, grounded: false }, 1 / 60)).toEqual({ offset: 0, cover: 0 });
  });
  it('covers no more rows than the feet sank, and grass tufts stay put in the world', () => {
    expect(coverRows({ ...input, material: grass }, 1)).toBe(1);
    expect(coverRows({ ...input, material: grass }, 3)).toBe(2);
    expect(coverRows({ ...input, material: stone }, 1)).toBe(0);
    const a = blades(100, 12, 2, 3), b = blades(104, 12, 2, 3);
    const at = (list: typeof a, x: number) => list.find(t => t.x === x);
    for (let x = 92; x <= 112; x++) expect(at(a, x)).toEqual(at(b, x));
    expect(a.every(t => t.height >= 1 && t.height <= 4)).toBe(true);
  });
});

describe('footfalls', () => {
  it('counts planted feet as opaque runs at least 6 px wide in the bottom rows', () => {
    const row = (runs: [number, number][]) => Array.from({ length: 48 }, (_, x) => runs.some(([a, b]) => x >= a && x <= b) ? 255 : 0);
    expect(plantedFeet([...row([[11, 19], [31, 37]]), ...row([])], 48)).toBe(2);
    expect(plantedFeet(row([[13, 15]]), 48)).toBe(0); // a toe-off is not a step
  });
  it('places footfalls where a foot lands: the measured walk 00/04 and run 01/05', () => {
    expect(contactFrames([2, 1, 1, 1, 2, 2, 1, 1])).toEqual([0, 4]); // hero-move walk
    expect(contactFrames([0, 1, 1, 0, 0, 1, 1, 0])).toEqual([1, 5]); // hero-run run
  });
  it('kicks a step backwards and a landing to both sides, hard landings bigger', () => {
    const puff = garden.materials.grass.puff!;
    const step = puffParticles(puff, 'step', 1, () => 0.5);
    expect(step).toHaveLength(5); expect(step.every(p => p.dx < 0 && p.dy < 0)).toBe(true);
    const land = puffParticles(puff, 'land', 1, () => 0.5), hard = puffParticles(puff, 'hard-land', 1, () => 0.5);
    expect(land.some(p => p.dx > 0) && land.some(p => p.dx < 0)).toBe(true);
    expect(hard.length).toBeGreaterThan(land.length);
  });
});

describe('clip timing from anims.json', () => {
  it('derives landing lengths from the clips, holds included', () => {
    expect(clipLength(clips.land, 'land')).toBeCloseTo(2 / clips.jump.fps);
    expect(clipLength(clips['hard-landing'], 'hard-landing')).toBeCloseTo(5 / clips['hard-landing'].fps);
  });
  it('follows the jump arc: rise frames 1–4 with the apex at vy 0, descent 5–6, then the fall loop', () => {
    expect(arcFrame(-JUMP_SPEED, JUMP_SPEED, 9)).toBe(1);
    expect(arcFrame(-1, JUMP_SPEED, 9)).toBe(4);
    expect(arcFrame(10, JUMP_SPEED, 9)).toBe(5);
    expect(arcFrame(JUMP_SPEED * 0.8, JUMP_SPEED, 9)).toBe(6);
    expect(arcFrame(JUMP_SPEED * 1.2, JUMP_SPEED, 9)).toBeNull();
  });
  it('plays a jump crouch, the arc forwards only, and walks off a ledge straight into the descent', () => {
    const m = new LocomotionAnimation(clips);
    const air = (vy: number) => ({ vy, launch: JUMP_SPEED });
    expect(m.update('jump', 1 / 60, 0, air(-JUMP_SPEED)).frame).toBe('jump-00');
    const frames: number[] = [];
    for (let vy = -JUMP_SPEED; vy < JUMP_SPEED * 1.1; vy += 10) frames.push(Number(m.update(vy < 0 ? 'jump' : 'fall', 1 / 60, 0, air(vy)).frame.slice(-2)));
    expect(frames.every((f, i) => i === 0 || f >= frames[i - 1] || m.clip === 'fall')).toBe(true);
    expect(m.clip).toBe('fall');
    const ledge = new LocomotionAnimation(clips);
    ledge.update('walk', 1 / 60, 90);
    expect(ledge.update('fall', 1 / 60, 90, air(20)).frame).toBe('jump-05');
  });
  it('plays the drawn hit clip at its fps instead of a tint, and the knockback for heavy hits', () => {
    const hurt = new HurtAnimation(table('hero-hurt'), { death: { frames: 12, fps: 12, loop: false } });
    const life = new Life({ x: 0, y: 0 });
    life.hit(1); hurt.start(1);
    expect(hurt.update(life, 0, false)?.frame).toBe('hit-00'); // the drawn flash
    expect(hurt.update(life, 1 / 12, false)?.frame).toBe('hit-01');
    expect(hurt.alpha(life, 80)).toBe(1); // no blink while the clip plays
    const heavy = new HurtAnimation(table('hero-hurt'), {});
    heavy.start(2);
    expect(heavy.update(life, 0, false)?.frame).toBe('knockback-00');
    life.knock = 0;
    expect(heavy.update(life, 0.3, false)?.frame).toBe('hit-03');
    expect(heavy.update(life, 0, true)).toBeNull(); // walking away ends the recovery
  });
});
