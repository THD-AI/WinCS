import { describe, expect, it } from 'vitest';
import { RUN_SPEED, WALK_SPEED } from '../player/movement';
import { DexterGuide, GUIDE, PLUSH, Route, stopsFrom, type GuideView, type Pt } from './prologueGuide';

interface Chunk { chunk: string; walk: Pt[][]; oneWay: Pt[][]; interact: { id: string; kind: string; act?: string; x: number; y: number; w: number; h: number }[]; spawn: { id: string; kind: string; x: number; y: number }[] }
const files = import.meta.glob('../../../art/stages/hidden-garden/hg-*.clean.collision.json', { eager: true, import: 'default' }) as Record<string, Chunk>;
/** The five chunks in a row, 2160 px apart (docs/04), placed in stage px like placeCollision does. */
const chunks = Object.values(files).sort((a, b) => a.chunk.localeCompare(b.chunk));
const offset = (c: Chunk) => Number(c.chunk.split('-')[1]) * 2160;
const lines = chunks.flatMap(c => [...c.walk, ...c.oneWay].map(line => line.map(([x, y]): Pt => [x + offset(c), y])));
const boxes = chunks.flatMap(c => c.interact.map(box => ({ ...box, x: box.x + offset(c) })));
const spawns = chunks.flatMap(c => c.spawn.map(s => ({ ...s, x: s.x + offset(c) })));
const bench = spawns.find(s => s.id === 'dexter-bench')!;
const start = spawns.find(s => s.kind === 'player')!;
const { wakeX, stops } = stopsFrom(boxes);
const pond = stops[stops.length - 1];
const garden = () => new DexterGuide({ bench, lines, ...stopsFrom(boxes) });
const DT = 1000 / 60;

/**
 * Plays the hero from the gate to the jetty with `speedAt(t)` px/s (accelerating like player/movement.ts) and
 * returns the smallest lead Dexter kept while leading, and the log every `every` ms.
 */
function chase(speedAt: (t: number) => number, every = 1000) {
  const dexter = garden();
  const route = new Route(lines);
  const hero = { x: start.x, y: start.y };
  let vx = 0;
  let minGap = Infinity;
  let overtaken = 0;
  const log: { t: number; hero: number; dexter: number; gap: number; state: string; anim: string }[] = [];
  const anims = new Set<string>();
  let view!: GuideView;
  let t = 0;
  for (; t < 300_000 && dexter.state !== 'at-pond'; t += DT) {
    vx = Math.min(speedAt(t), vx + 1500 * DT / 1000);
    if (speedAt(t) < vx) vx = Math.max(speedAt(t), vx - 2000 * DT / 1000);
    hero.x = Math.min(hero.x + (vx * DT) / 1000, pond.x + 200);
    hero.y = route.groundAt(hero.x, hero.y) ?? hero.y;
    view = dexter.update(DT, hero);
    anims.add(view.anim);
    const state: string = view.state;
    if (state !== 'sit' && state !== 'at-pond') minGap = Math.min(minGap, dexter.gap(hero));
    if (state !== 'at-pond' && dexter.gap(hero) <= 0) overtaken++;
    if (Math.floor(t / every) !== Math.floor((t + DT) / every)) {
      log.push({ t: Math.round(t / 100) / 10, hero: Math.round(hero.x), dexter: Math.round(dexter.x), gap: Math.round(dexter.gap(hero)), state: dexter.state, anim: view.anim });
    }
  }
  return { dexter, minGap, overtaken, log, anims, t };
}

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

describe('the garden staging', () => {
  it('starts the hero in the open gate, on the path, with Dexter on the bench well ahead', () => {
    // The gate in hg-0-0.png: stone pillars at x≈95–130 and 270–310, the open leaves between them.
    expect(start.x).toBeGreaterThan(130);
    expect(start.x).toBeLessThan(275);
    expect(Math.abs(new Route(lines).groundAt(start.x, start.y)! - start.y)).toBeLessThan(3);
    expect(start.x).toBeLessThan(wakeX);
    expect(bench.x - start.x).toBeGreaterThan(GUIDE.pauseAt);
  });

  it('wakes at the bench, points at the shed roof, and ends at the jetty', () => {
    expect(wakeX).toBeLessThan(bench.x - GUIDE.hopGap);
    expect(stops.map(s => s.act)).toEqual(['wait', 'wait', 'point', 'wait', 'wait', 'wait', 'pond']);
    expect(stops.every((s, i) => i === 0 || s.x > stops[i - 1].x)).toBe(true);
  });

  it('derives its distances from the 27 px plush and 43 px/m', () => {
    expect(GUIDE.lead).toBe(4 * PLUSH);
    expect(GUIDE.walk).toBe(WALK_SPEED);
    expect(GUIDE.sprint).toBeGreaterThan(RUN_SPEED);
  });
});

describe('Dexter waking on the bench', () => {
  it('sits facing the gate until the hero walks up, looks round, bows, hops off and beckons', () => {
    const dexter = garden();
    let view = dexter.update(DT, start);
    expect(view).toMatchObject({ state: 'sit', anim: 'sit', facing: -1, x: bench.x, y: bench.y });
    const hero = { x: wakeX + 1, y: 470 };
    view = dexter.update(DT, hero);
    expect(view).toMatchObject({ state: 'wake', anim: 'look' });
    view = dexter.update(GUIDE.wakeLook, hero);
    expect(view.anim).toBe('bow');
    view = dexter.update(GUIDE.bow, hero);
    expect(view).toMatchObject({ state: 'hop-off', anim: 'hop' });
    for (let t = 0; t <= GUIDE.hopOff; t += DT) view = dexter.update(DT, hero);
    view = dexter.update(DT, hero);
    expect(view.state).toBe('wait');
    expect(view.y).toBeGreaterThan(bench.y);
    expect(view.x).toBeGreaterThan(bench.x);
    view = dexter.update(GUIDE.lookBack + GUIDE.minWait, hero);
    expect(view.anim).toBe('beckon');
    expect(view.facing).toBe(-1);
    // The hero comes closer: he turns and leads.
    for (let t = 0; t < 4000 && dexter.state === 'wait'; t += DT) dexter.update(DT, { x: (hero.x += 1.6), y: 470 });
    expect(dexter.state).toBe('lead');
    expect(dexter.gap(hero)).toBeGreaterThan(GUIDE.hopGap - 5);
  });

  it('skips the bow and hops off at once when the hero is already at the bench', () => {
    const dexter = garden();
    dexter.update(DT, { x: wakeX + 1, y: 470 });
    const view = dexter.update(DT, { x: bench.x - GUIDE.hopGap + 10, y: 470 });
    expect(view.anim).toBe('hop');
  });
});

describe('Dexter leading', () => {
  it('is never overtaken by a walking hero, and reaches the jetty first', () => {
    const run = chase(() => WALK_SPEED);
    expect(run.dexter.state).toBe('at-pond');
    expect(run.overtaken).toBe(0);
    expect(run.minGap).toBeGreaterThan(PLUSH);
  });

  it('is never overtaken by a running hero: he hops ahead and scampers', () => {
    const run = chase(() => RUN_SPEED);
    expect(run.dexter.state).toBe('at-pond');
    expect(run.overtaken).toBe(0);
    expect(run.minGap).toBeGreaterThan(PLUSH / 2);
    expect(run.anims.has('hop')).toBe(true);
    expect(run.anims.has('run')).toBe(true);
  });

  it('is never overtaken by a hero who sprints, stops and sprints again', () => {
    const run = chase(t => (Math.floor(t / 2500) % 2 === 0 ? RUN_SPEED : t % 5000 < 3500 ? 0 : WALK_SPEED));
    expect(run.dexter.state).toBe('at-pond');
    expect(run.overtaken).toBe(0);
    expect(run.minGap).toBeGreaterThan(PLUSH / 2);
  });

  it('holds about the lead distance at the hero\'s own pace', () => {
    for (const speed of [WALK_SPEED, RUN_SPEED]) {
      const run = chase(() => speed, 250);
      const leading = run.log.filter(l => l.state === 'lead' && l.t > 10);
      const mean = leading.reduce((s, l) => s + l.gap, 0) / leading.length;
      expect(mean).toBeGreaterThan(GUIDE.hopGap);
      expect(mean).toBeLessThan(GUIDE.pauseAt);
    }
  });

  it('hops ahead when the hero closes in on him', () => {
    const dexter = garden();
    dexter.placeAt(1);
    const hero = { x: dexter.x - GUIDE.far + 10, y: 390 };
    let hopped = false;
    for (let t = 0; t < 6000 && !hopped; t += DT) {
      hero.x += (WALK_SPEED * DT) / 1000;
      hopped = dexter.update(DT, hero).anim === 'hop';
    }
    // He springs off ahead with a hop as soon as the hero is back within the lead band.
    expect(hopped).toBe(true);
    expect(dexter.gap(hero)).toBeLessThan(GUIDE.pauseResume + 2);
    expect(dexter.gap(hero)).toBeGreaterThan(GUIDE.hopGap / 2);
  });

  it('waits and looks back only when the hero is far behind; beckons, then sweats', () => {
    const dexter = garden();
    dexter.placeAt(1);
    const hero = { x: dexter.x - GUIDE.lead, y: 390 };
    // The hero just stands: he leads on at an amble until the hero is far behind, then stops.
    const views: GuideView[] = [];
    for (let t = 0; t < 20_000 && (views.length < 60 || dexter.state !== 'wait'); t += DT) views.push(dexter.update(DT, hero));
    for (let t = 0; t < 400; t += DT) views.push(dexter.update(DT, hero));
    expect(dexter.state).toBe('wait');
    expect(dexter.gap(hero)).toBeGreaterThan(GUIDE.far);
    expect(views.some(v => v.anim === 'walk')).toBe(true);
    const anims = new Set<string>();
    for (let t = 0; t < 12_000; t += DT) anims.add(dexter.update(DT, hero).anim);
    expect(anims.has('beckon')).toBe(true);
    expect(anims.has('sweat')).toBe(true);
    expect(dexter.state).toBe('wait');
    // Very far: he sweats.
    expect(dexter.update(DT, { x: dexter.x - GUIDE.veryFar - 10, y: 390 }).anim).toBe('sweat');
  });

  it('passes a waypoint without stopping when the hero is on his heels', () => {
    const run = chase(() => WALK_SPEED, 100);
    const waits = run.log.filter(l => l.state === 'wait' && l.t > 12);
    expect(waits.length).toBe(0);
  });

  it('points up at the shed roof when the hero is a little behind', () => {
    const dexter = garden();
    const point = stops.findIndex(s => s.act === 'point');
    dexter.placeAt(point - 1);
    const hero = { x: dexter.x - GUIDE.lead, y: 387 };
    let pointed = false;
    for (let t = 0; t < 120_000 && !pointed; t += DT) {
      if (dexter.gap(hero) > GUIDE.lead + 20) hero.x += (WALK_SPEED * DT) / 1000;
      pointed = dexter.update(DT, hero).state === 'point';
    }
    expect(pointed).toBe(true);
  });

  it('lands with a squash after a hop', () => {
    const dexter = garden();
    dexter.placeAt(1);
    const hero = { x: dexter.x - GUIDE.hopGap + 5, y: 390 };
    dexter.update(DT, hero);
    let view = dexter.update(DT, hero);
    while (dexter.airborne) view = dexter.update(DT, hero);
    expect(view.squash).toBeGreaterThan(0.5);
  });

  it('can be put at the jetty for the finale', () => {
    const dexter = garden();
    dexter.placeAt(Number.MAX_SAFE_INTEGER);
    expect(dexter.state).toBe('at-pond');
    expect(dexter.x).toBe(pond.x);
  });
});

