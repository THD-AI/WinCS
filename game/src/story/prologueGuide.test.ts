import { describe, expect, it } from 'vitest';
import { DexterGuide, GUIDE, Route, stopsFrom, type Pt, type Stop } from './prologueGuide';

interface Chunk { chunk: string; walk: Pt[][]; oneWay: Pt[][]; interact: { id: string; kind: string; act?: string; x: number; y: number; w: number; h: number }[]; spawn: { id: string; kind: string; x: number; y: number }[] }
const files = import.meta.glob('../../../art/stages/hidden-garden/hg-*.clean.collision.json', { eager: true, import: 'default' }) as Record<string, Chunk>;
/** The five chunks in a row, 2160 px apart (docs/04), placed in stage px like placeCollision does. */
const chunks = Object.values(files).sort((a, b) => a.chunk.localeCompare(b.chunk));
const offset = (c: Chunk) => Number(c.chunk.split('-')[1]) * 2160;
const lines = chunks.flatMap(c => [...c.walk, ...c.oneWay].map(line => line.map(([x, y]): Pt => [x + offset(c), y])));
const boxes = chunks.flatMap(c => c.interact.map(box => ({ ...box, x: box.x + offset(c) })));
const bench = chunks.flatMap(c => c.spawn.map(s => ({ ...s, x: s.x + offset(c) }))).find(s => s.id === 'dexter-bench')!;
const garden = () => new DexterGuide({ bench, lines, ...stopsFrom(boxes) });

describe('the route', () => {
  const route = new Route([[[0, 100], [100, 100]], [[50, 200], [150, 200]]]);
  it('keeps to the line nearest his height where lines overlap', () => {
    expect(route.groundAt(75, 110)).toBe(100);
    expect(route.groundAt(75, 190)).toBe(200);
    expect(route.groundAt(200, 100)).toBeUndefined();
  });
  it('finds the next ground across a gap', () => {
    const gap = new Route([[[0, 100], [100, 100]], [[180, 100], [300, 100]]]);
    expect(gap.landing(100, 1)).toBe(180);
  });
});

describe('the garden waypoints', () => {
  it('wake at the bench, end at the jetty pointing, and point at the shed roof', () => {
    const { wakeX, stops } = stopsFrom(boxes);
    expect(wakeX).toBeLessThan(bench.x);
    expect(stops.map(s => s.act)).toEqual(['wait', 'wait', 'point', 'wait', 'wait', 'wait', 'pond']);
    expect(stops.every((s, i) => i === 0 || s.x > stops[i - 1].x)).toBe(true);
  });
});

describe('Dexter leading the first quest', () => {
  it('sits on the bench until the hero walks up, then hops off and beckons', () => {
    const dexter = garden();
    let view = dexter.update(16, { x: 120, y: 460 });
    expect(view).toMatchObject({ state: 'sit', anim: 'idle', facing: -1, x: bench.x, y: bench.y });
    view = dexter.update(16, { x: stopsFrom(boxes).wakeX + 1, y: 470 });
    expect(view.state).toBe('hop-off');
    expect(view.anim).toBe('hop');
    for (let t = 0; t < GUIDE.hopOff; t += 16) view = dexter.update(16, { x: 300, y: 470 });
    view = dexter.update(16, { x: 300, y: 470 });
    expect(view.state).toBe('wait');
    expect(view.anim).toBe('beckon');
    expect(view.facing).toBe(-1);
    expect(view.y).toBeGreaterThan(bench.y);
  });

  it('waits at a stop until the hero comes within range', () => {
    const dexter = garden();
    dexter.placeAt(0);
    for (let t = 0; t < 5000; t += 16) dexter.update(16, { x: 200, y: 470 });
    expect(dexter.state).toBe('wait');
    dexter.update(16, { x: dexter.x - GUIDE.near + 5, y: 470 });
    expect(dexter.state).toBe('lead');
  });

  it('stops to look back when the hero falls behind, then carries on to the same stop', () => {
    const dexter = garden();
    dexter.placeAt(0);
    const target = dexter.stop!.id;
    dexter.update(GUIDE.minWait, { x: dexter.x, y: 470 });
    dexter.update(16, { x: dexter.x, y: 470 });
    expect(dexter.state).toBe('lead');
    const lagging = dexter.stop!;
    for (let t = 0; t < 8000 && dexter.state === 'lead'; t += 16) dexter.update(16, { x: dexter.x - GUIDE.far - 50, y: 470 });
    expect(dexter.state).toBe('wait');
    expect(lagging.id).not.toBe(target);
    const stopBefore = dexter.stop!.id;
    dexter.update(GUIDE.minWait, { x: dexter.x - 20, y: 470 });
    expect(dexter.state).toBe('lead');
    expect(dexter.stop!.id).toBe(stopBefore);
  });

  it('walks the whole garden behind a following hero: every stop, hops on the way, ends at the pond', () => {
    const dexter = garden();
    const hero = { x: 120, y: 460 };
    const seen = new Set<string>();
    const pointed = new Set<string>();
    let hops = 0;
    let wasAir = false;
    for (let t = 0; t < 240_000 && dexter.state !== 'at-pond'; t += 16) {
      // The hero follows at walking pace up to 90 px behind him.
      if (hero.x < dexter.x - 90) hero.x += 153 * 0.016;
      const view = dexter.update(16, hero);
      expect(Number.isFinite(view.x) && Number.isFinite(view.y)).toBe(true);
      if (dexter.state === 'wait' || dexter.state === 'point') seen.add(dexter.stop?.id ?? 'end');
      if (dexter.state === 'point') pointed.add(dexter.stop!.id);
      if (dexter.airborne && !wasAir) hops++;
      wasAir = dexter.airborne;
      if (!dexter.airborne && dexter.state === 'lead') {
        expect(Math.abs(dexter.route.groundAt(dexter.x, dexter.y)! - dexter.y)).toBeLessThan(1);
      }
    }
    const stops: Stop[] = stopsFrom(boxes).stops;
    expect(dexter.state).toBe('at-pond');
    expect(dexter.x).toBeCloseTo(stops[stops.length - 1].x, 0);
    for (const stop of stops.slice(0, -1)) expect(seen.has(stop.id)).toBe(true);
    expect([...pointed]).toEqual(['dexter-waypoint-4']);
    expect(hops).toBeGreaterThanOrEqual(3);
  });

  it('scurries ahead when the hero overtakes him', () => {
    const dexter = garden();
    dexter.placeAt(0);
    dexter.update(GUIDE.minWait, { x: dexter.x + 50, y: 470 });
    dexter.update(16, { x: dexter.x + 50, y: 470 });
    const x0 = dexter.x;
    dexter.update(100, { x: dexter.x + 50, y: 470 });
    expect(dexter.x - x0).toBeCloseTo(GUIDE.scurry / 10, 0);
  });
});
