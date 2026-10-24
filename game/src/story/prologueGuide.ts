/**
 * Dexter leading the first quest (docs/03 "Prologue", #50): he sits on the bench, hops off when the hero walks
 * up, and waddles ahead along the walk lines, stopping at each waypoint to look back until the hero is close.
 * He hops where the route climbs or breaks, points up at the shed roof, and ends at the jetty pointing at the
 * water. Pure – positions in stage px, time in ms – so it is tested without Phaser.
 */
export type Pt = [number, number];
export interface Position { x: number; y: number }

export type GuideState = 'sit' | 'hop-off' | 'lead' | 'wait' | 'point' | 'at-pond';
/** `sit` on the bench, `look` back once on arriving at a stop, then `wait` (or `beckon` when the hero is far). */
export type GuideAnim = 'sit' | 'look' | 'wait' | 'hop' | 'walk' | 'point' | 'beckon';

/** A stop along the route, from a `dexter-waypoint` interact box: x is the box centre. */
export interface Stop { id: string; x: number; act: 'wait' | 'point' | 'pond' }

export interface GuideSetup {
  /** Where he sits (the `dexter-bench` spawn, his feet). */
  bench: Position;
  /** The hero walking past this x wakes him (the left edge of the `wake` waypoint box). */
  wakeX: number;
  stops: Stop[];
  /** walk + oneWay polylines in stage px. */
  lines: Pt[][];
}

export const GUIDE = {
  /** Waddle speed (px/s): a little slower than the hero's 153 px/s walk, so he stays just ahead. */
  speed: 115,
  /** When the hero overtakes him he scurries to get ahead again. */
  scurry: 230,
  /** He moves on once the hero is this close (px)… */
  near: 170,
  /** …and stops to look back when the hero falls this far behind while he leads. */
  far: 420,
  /** Beyond this distance he beckons instead of just looking. */
  beckonAt: 230,
  /** Minimum look-back at a stop (ms) – the first one, off the bench, lasts longer. */
  minWait: 650,
  firstWait: 1100,
  pointFor: 1700,
  /** Look-ahead for steps and gaps (px), the rise that makes him hop instead of walk. */
  lookAhead: 20,
  stepRise: 12,
  hopOff: 520,
  /** The look-back clip: dexter-prologue `look-back`, 3 frames at 12 fps. */
  lookBack: 250,
} as const;

/** Ground lookup over the walk lines; where lines overlap, the one nearest the current height wins. */
export class Route {
  constructor(private readonly lines: Pt[][]) {}

  groundAt(x: number, near: number): number | undefined {
    let best: number | undefined;
    for (const line of this.lines) {
      for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1], line[i]];
        if (x < a[0] || x > b[0]) continue;
        const y = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
        if (best === undefined || Math.abs(y - near) < Math.abs(best - near)) best = y;
        break;
      }
    }
    return best;
  }

  /** First x after `from` (moving `dir`) that has ground, scanning up to `range` px. */
  landing(from: number, dir: number, range = 400): number | undefined {
    for (let d = 4; d <= range; d += 4) if (this.groundAt(from + dir * d, 0) !== undefined) return from + dir * d;
    return undefined;
  }
}

interface Hop { from: Position; to: Position; t: number; duration: number; height: number }

export interface GuideView { x: number; y: number; anim: GuideAnim; facing: 1 | -1; state: GuideState }

export class DexterGuide {
  state: GuideState = 'sit';
  x: number;
  y: number;
  facing: 1 | -1 = 1;
  /** Index of the stop he is heading to or waiting at. */
  next = 0;
  private hop?: Hop;
  private elapsed = 0;
  private waitFor = 0;
  private looking = false;
  /** The direction he last walked to a stop (0 = not moving yet); passing the stop mid-hop counts as arriving. */
  private heading = 0;
  readonly route: Route;

  constructor(private readonly setup: GuideSetup) {
    this.x = setup.bench.x;
    this.y = setup.bench.y;
    this.route = new Route(setup.lines);
  }

  get stop(): Stop | undefined { return this.setup.stops[this.next]; }
  get airborne(): boolean { return !!this.hop; }

  /** Advance by dt ms with the hero's feet at `hero`. */
  update(dt: number, hero: Position): GuideView {
    this.elapsed += dt;
    if (this.hop && this.stepHop(dt)) return this.view(hero);
    switch (this.state) {
      case 'sit':
        this.facing = hero.x < this.x ? -1 : 1;
        if (hero.x >= this.setup.wakeX) this.hopOff();
        break;
      case 'hop-off':
        this.enter('wait', GUIDE.firstWait);
        break;
      case 'wait':
        this.facing = hero.x < this.x ? -1 : 1;
        if (this.elapsed >= this.waitFor && this.closeEnough(hero)) {
          if (this.looking) this.looking = false; else this.next++;
          this.enter(this.stop ? 'lead' : 'at-pond');
        }
        break;
      case 'point':
        if (this.elapsed >= GUIDE.pointFor) this.enter('wait', GUIDE.minWait);
        break;
      case 'lead':
        this.lead(dt, hero);
        break;
      case 'at-pond':
        this.facing = 1;
        break;
    }
    return this.view(hero);
  }

  /** Put him straight at a stop (dev shortcut, and the finale's start position). */
  placeAt(index: number): void {
    const stop = this.setup.stops[Math.min(index, this.setup.stops.length - 1)];
    this.next = Math.min(index, this.setup.stops.length - 1);
    this.x = stop.x;
    this.y = this.route.groundAt(stop.x, this.y) ?? this.y;
    this.hop = undefined;
    this.arrive(stop);
  }

  private closeEnough(hero: Position): boolean {
    return Math.abs(hero.x - this.x) <= GUIDE.near || hero.x > this.x;
  }

  private hopOff(): void {
    const toX = this.x + 34;
    const toY = this.route.groundAt(toX, this.y + 20) ?? this.y;
    this.facing = 1;
    this.enter('hop-off');
    this.hop = { from: { x: this.x, y: this.y }, to: { x: toX, y: toY }, t: 0, duration: GUIDE.hopOff, height: 22 };
  }

  private lead(dt: number, hero: Position): void {
    const stop = this.stop;
    if (!stop) return this.enter('at-pond');
    if (this.heading && this.heading * (stop.x - this.x) <= 0) return this.arrive(stop);
    const dir = stop.x >= this.x ? 1 : -1;
    this.facing = dir;
    this.heading = dir;
    if (hero.x < this.x - GUIDE.far) {
      // Too far behind: stop and look back where he is, then carry on to the same stop.
      this.looking = true;
      this.heading = 0;
      return this.enter('wait', GUIDE.minWait);
    }
    const speed = hero.x > this.x - 10 ? GUIDE.scurry : GUIDE.speed;
    const step = Math.min(Math.abs(stop.x - this.x), (speed * dt) / 1000);
    const aheadX = this.x + dir * GUIDE.lookAhead;
    const ahead = this.route.groundAt(aheadX, this.y);
    if (ahead === undefined || this.y - ahead > GUIDE.stepRise) {
      // A gap or a step up: hop to the next ground.
      const landX = ahead === undefined ? this.route.landing(this.x, dir) : this.x + dir * (GUIDE.lookAhead + 10);
      if (landX !== undefined) {
        const landY = this.route.groundAt(landX + dir * 6, ahead ?? this.y) ?? this.y;
        const to = { x: landX + dir * 6, y: landY };
        const dist = Math.hypot(to.x - this.x, to.y - this.y);
        this.hop = { from: { x: this.x, y: this.y }, to, t: 0, duration: 320 + dist * 1.6, height: 18 + Math.max(0, this.y - to.y) };
        return;
      }
    }
    this.x += dir * step;
    this.y = this.route.groundAt(this.x, this.y) ?? this.y;
    if (Math.abs(stop.x - this.x) < 0.5) this.arrive(stop);
  }

  private arrive(stop: Stop): void {
    this.looking = false;
    this.heading = 0;
    if (stop.act === 'pond') { this.facing = 1; return this.enter('at-pond'); }
    if (stop.act === 'point') return this.enter('point');
    this.enter('wait', GUIDE.minWait);
  }

  /** Returns true while still in the air. */
  private stepHop(dt: number): boolean {
    const hop = this.hop!;
    hop.t = Math.min(1, hop.t + dt / hop.duration);
    const t = hop.t;
    this.x = hop.from.x + (hop.to.x - hop.from.x) * t;
    this.y = hop.from.y + (hop.to.y - hop.from.y) * t - hop.height * 4 * t * (1 - t);
    if (t < 1) return true;
    this.hop = undefined;
    this.y = hop.to.y;
    return false;
  }

  private enter(state: GuideState, waitFor = 0): void {
    this.state = state;
    this.elapsed = 0;
    this.waitFor = waitFor;
  }

  private view(hero: Position): GuideView {
    let anim: GuideAnim = 'wait';
    if (this.hop) anim = 'hop';
    else if (this.state === 'sit') anim = 'sit';
    else if (this.state === 'lead') anim = 'walk';
    else if (this.state === 'point' || this.state === 'at-pond') anim = 'point';
    else if (this.state === 'wait' && this.elapsed < GUIDE.lookBack) anim = 'look';
    else if (this.state === 'wait' && Math.abs(hero.x - this.x) > GUIDE.beckonAt) anim = 'beckon';
    return { x: this.x, y: this.y, anim, facing: this.facing, state: this.state };
  }
}

/** The stops from the collision's `dexter-waypoint` boxes, in route order; `act` comes from the data. */
export function stopsFrom(boxes: { id?: string; kind?: string; act?: unknown; x: number; w: number }[]): { wakeX: number; stops: Stop[] } {
  const waypoints = boxes.filter(box => box.kind === 'dexter-waypoint').sort((a, b) => a.x - b.x);
  const wake = waypoints.find(box => box.act === 'wake') ?? waypoints[0];
  const stops = waypoints.filter(box => box !== wake).map((box): Stop => ({
    id: box.id ?? 'waypoint',
    x: box.x + box.w / 2,
    act: box.act === 'point' || box.act === 'pond' ? box.act : 'wait',
  }));
  return { wakeX: wake ? wake.x : -Infinity, stops };
}
