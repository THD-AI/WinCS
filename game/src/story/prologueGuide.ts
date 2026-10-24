import { RUN_SPEED, WALK_SPEED } from '../player/movement';

/**
 * Dexter leading the first quest (docs/03 "Prologue", #50 #160): he sits on the bench, looks up and bows when
 * the hero walks in through the gate, hops off, and then LEADS – he keeps a few plush-lengths ahead of the hero
 * at the hero's own pace, hops ahead when the hero closes in and scampers when the hero runs at him, so he is
 * never overtaken. Only when the hero falls far behind (or dawdles at a waypoint) does he stop, look back,
 * beckon, and – left long enough – sweat. He points up at the shed roof on the way and ends at the jetty.
 * Pure – positions in stage px, time in ms – so it is tested without Phaser. The route is read from the walk
 * lines at runtime (they may be re-authored); every distance below is in plush-lengths or metres.
 */
export type Pt = [number, number];
export interface Position { x: number; y: number }

export type GuideState = 'sit' | 'wake' | 'hop-off' | 'lead' | 'wait' | 'point' | 'at-pond';
/** `look` back on stopping, then `wait` with `beckon`/`sweat` fidgets; `run` is the walk clip played fast. */
export type GuideAnim = 'sit' | 'look' | 'bow' | 'wait' | 'hop' | 'walk' | 'run' | 'point' | 'beckon' | 'sweat';

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

/** The stage's scale (docs/09: the 76 px hero is 1.83 m) and Dexter's height in it (docs/03: a 27 px plush). */
export const PX_PER_M = 43;
export const PLUSH = 27;
/** His hop clip: dexter `hop`, 4 frames at 12 fps. */
const HOP_CLIP = (4 / 12) * 1000;

export const GUIDE = {
  /** He keeps this far ahead of the hero (px): four plush-lengths, ~2.5 m. */
  lead: 4 * PLUSH,
  /** The hero closing within this (three plush-lengths) makes him hop ahead. */
  hopGap: 3 * PLUSH,
  /** Inside two plush-lengths he drops everything and scampers at full speed. */
  scamper: 2 * PLUSH,
  /** He stops to look back when the hero is this far behind (8 m)… */
  far: 8 * PX_PER_M,
  /** …and leads on once the hero is back within 6 m. */
  resume: 6 * PX_PER_M,
  /**
   * A hero who has STOPPED (not just slowed) this far behind: he does not wander off but stops and looks back after
   * a few steps – six plush-lengths, well inside the screen – and leads on when the hero comes within the lead.
   */
  stopAt: 6 * PLUSH,
  stopResume: 4 * PLUSH,
  /** The hero counts as stopped below this smoothed speed (px/s). */
  stopped: WALK_SPEED * 0.25,
  /** At a `wait` waypoint he pauses only if the hero is more than 5 m behind… */
  pauseAt: 5 * PX_PER_M,
  /** …and goes on when the hero is within six plush-lengths. */
  pauseResume: 6 * PLUSH,
  /** Beyond 14 m he sweats. */
  veryFar: 14 * PX_PER_M,
  /** The hero's speeds (player/movement.ts): he matches them. */
  walk: WALK_SPEED,
  run: RUN_SPEED,
  /** A slow amble (1 m/s) when the hero dawdles inside the lead distance band. */
  amble: 1 * PX_PER_M,
  /** His plush sprint: a third faster than the hero's run, so a running hero can never close on him. */
  sprint: RUN_SPEED * 1.35,
  /** Speed per px of gap error (1/s): pulling ahead when too close, easing off when too far. */
  gainIn: 4,
  gainOut: 1,
  /** Acceleration (px/s²) easing into a walk; when the hero is on his heels he takes off at once. */
  accel: 700,
  burst: 3000,
  /** A hop ahead: his hop clip's length, at sprint speed; then a short cooldown before the next. */
  hopTime: HOP_CLIP,
  hopCooldown: 180,
  hopLift: 0.6 * PLUSH,
  /** Off the bench: two plush-lengths forward, a little slower than a hop. */
  hopOffDistance: 2 * PLUSH,
  hopOff: HOP_CLIP * 1.4,
  /** The wake beat: he looks round (look-back clip, 3 frames at 12 fps), then bows. */
  wakeLook: 250,
  bow: 650,
  /** The look-back on stopping (ms), and the shortest stop. */
  lookBack: 250,
  minWait: 400,
  /** While waiting he beckons for `beckonFor` ms every `beckonEvery` ms; after `sweatAfter` ms he sweats too. */
  beckonEvery: 2400,
  beckonFor: 750,
  sweatAfter: 4500,
  pointFor: 1700,
  /** Look-ahead for steps and gaps (px), and the rise or drop that makes him hop instead of walk. */
  lookAhead: 20,
  stepRise: 12,
  /** The squash after a landing (ms). */
  squash: 140,
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

export interface GuideView {
  x: number; y: number; anim: GuideAnim; facing: 1 | -1; state: GuideState;
  /** Animation speed (1 = the clip's own fps): the walk plays faster as he speeds up. */
  rate: number;
  /** 0..1 squash of a fresh landing. */
  squash: number;
}

export class DexterGuide {
  state: GuideState = 'sit';
  x: number;
  y: number;
  facing: 1 | -1 = 1;
  /** Index of the stop he is heading to or waiting at. */
  next = 0;
  /** His ground speed (px/s) while leading. */
  v = 0;
  /** The hero's smoothed forward speed (px/s). */
  heroV = 0;
  private hop?: Hop;
  private elapsed = 0;
  private clock = 0;
  private landedAt = -Infinity;
  private hopReadyAt = 0;
  private resumeAt: number = GUIDE.resume;
  private lastHeroX?: number;
  readonly route: Route;

  constructor(private readonly setup: GuideSetup) {
    this.x = setup.bench.x;
    this.y = setup.bench.y;
    this.route = new Route(setup.lines);
  }

  get stop(): Stop | undefined { return this.setup.stops[this.next]; }
  get airborne(): boolean { return !!this.hop; }
  /** How far ahead of the hero he is (px); negative would mean overtaken. */
  gap(hero: Position): number { return this.x - hero.x; }

  /** Advance by dt ms with the hero's feet at `hero`. */
  update(dt: number, hero: Position): GuideView {
    this.elapsed += dt;
    this.clock += dt;
    this.trackHero(dt, hero);
    if (this.hop && this.stepHop(dt)) return this.view(hero);
    const gap = this.gap(hero);
    switch (this.state) {
      case 'sit':
        this.facing = hero.x < this.x ? -1 : 1;
        if (hero.x >= this.setup.wakeX) this.enter('wake');
        break;
      case 'wake':
        this.facing = hero.x < this.x ? -1 : 1;
        // He looks round, bows – unless the hero is already at the bench, then he is off at once.
        if (this.elapsed >= GUIDE.wakeLook + GUIDE.bow || gap < GUIDE.hopGap) this.hopOff();
        break;
      case 'hop-off':
        // Landed: wait for the hero, beckoning, then lead.
        this.waitFor(GUIDE.pauseResume);
        break;
      case 'wait':
        this.facing = hero.x < this.x ? -1 : 1;
        // The hero comes on: he springs off ahead with a hop (at once if the hero is already on him).
        if (gap < GUIDE.hopGap) this.leadOn(true);
        else if (this.elapsed >= GUIDE.minWait && gap < this.resumeAt) this.leadOn(this.heroV > GUIDE.walk * 0.5);
        break;
      case 'point':
        this.facing = 1;
        if (gap < GUIDE.hopGap) this.leadOn(true);
        else if (this.elapsed >= GUIDE.pointFor) this.waitFor(GUIDE.pauseResume);
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
    this.next = Math.min(index, this.setup.stops.length - 1);
    const stop = this.setup.stops[this.next];
    this.x = stop.x;
    this.y = this.route.groundAt(stop.x, this.y) ?? this.y;
    this.hop = undefined;
    this.v = 0;
    if (stop.act === 'pond') return this.enter('at-pond');
    this.next++;
    this.waitFor(GUIDE.pauseResume);
  }

  private trackHero(dt: number, hero: Position): void {
    if (this.lastHeroX !== undefined && dt > 0) {
      const v = Math.max(0, ((hero.x - this.lastHeroX) * 1000) / dt);
      this.heroV += (Math.min(v, GUIDE.sprint) - this.heroV) * Math.min(1, dt / 60);
    }
    this.lastHeroX = hero.x;
  }

  private hopOff(): void {
    const toX = this.x + GUIDE.hopOffDistance;
    const toY = this.route.groundAt(toX, this.y + PLUSH) ?? this.y;
    this.facing = 1;
    this.enter('hop-off');
    this.hop = { from: { x: this.x, y: this.y }, to: { x: toX, y: toY }, t: 0, duration: GUIDE.hopOff, height: GUIDE.hopLift + 6 };
  }

  private waitFor(resumeAt: number): void {
    this.v = 0;
    this.resumeAt = resumeAt;
    this.enter('wait');
  }

  private leadOn(hopNow: boolean): void {
    this.enter('lead');
    this.facing = 1;
    if (hopNow) this.hopAhead();
  }

  private lead(dt: number, hero: Position): void {
    const stop = this.stop;
    if (!stop) return this.enter('at-pond');
    this.facing = 1;
    const gap = this.gap(hero);
    if (gap > GUIDE.far) return this.waitFor(GUIDE.resume);
    if (gap > GUIDE.stopAt && this.heroV < GUIDE.stopped) return this.waitFor(GUIDE.stopResume);
    if (gap < GUIDE.hopGap && this.clock >= this.hopReadyAt && this.heroV > GUIDE.walk * 0.5 && this.hopAhead()) return;
    // Hold the lead distance at the hero's own pace; inside it, pull ahead (up to a sprint), beyond it, ease off.
    const target = gap < GUIDE.lead
      ? Math.min(GUIDE.sprint, Math.max(this.heroV, GUIDE.walk) + GUIDE.gainIn * (GUIDE.lead - gap))
      : Math.min(GUIDE.run, Math.max(GUIDE.amble, this.heroV - GUIDE.gainOut * (gap - GUIDE.lead)));
    if (gap < GUIDE.scamper) this.v = GUIDE.sprint;
    else {
      const rate = target > this.v && gap < GUIDE.lead ? GUIDE.burst : GUIDE.accel;
      this.v = approach(this.v, target, (rate * dt) / 1000);
    }
    const step = Math.min((this.v * dt) / 1000, this.end() - this.x);
    if (this.terrainHop()) return;
    this.x += step;
    this.y = this.route.groundAt(this.x, this.y) ?? this.y;
    this.passStops(hero);
  }

  /** A gap or a step up or down just ahead: hop to the next ground, never slower than the hero. */
  private terrainHop(): boolean {
    const aheadX = this.x + GUIDE.lookAhead;
    const ahead = this.route.groundAt(aheadX, this.y);
    if (ahead !== undefined && Math.abs(this.y - ahead) <= GUIDE.stepRise) return false;
    const duration = GUIDE.hopTime * 0.75;
    const reach = (this.hopSpeed() * duration) / 1000;
    let toX = this.x + Math.max(GUIDE.lookAhead + 16, reach);
    let toY = this.route.groundAt(toX, ahead ?? this.y);
    if (toY === undefined) {
      const land = this.route.landing(this.x + GUIDE.lookAhead, 1);
      if (land === undefined) return false;
      toX = Math.max(land + 6, toX);
      toY = this.route.groundAt(toX, ahead ?? this.y) ?? this.route.groundAt(land + 6, this.y) ?? this.y;
    }
    toX = Math.min(toX, this.end());
    this.jump({ x: toX, y: toY }, Math.max(duration, ((toX - this.x) / this.hopSpeed()) * 1000), GUIDE.hopLift + Math.max(0, this.y - toY));
    return true;
  }

  /** Hops cover ground at least at his sprint, and faster than the hero is going. */
  private hopSpeed(): number { return Math.max(GUIDE.sprint, this.heroV * 1.3, this.v); }
  private end(): number { return this.setup.stops[this.setup.stops.length - 1].x; }

  /** The hero closed in: a hop ahead along the route at sprint speed (one hop clip long). */
  private hopAhead(): boolean {
    const distance = Math.min(this.end() - this.x, (this.hopSpeed() * GUIDE.hopTime) / 1000);
    if (distance < PLUSH) return false;
    let toX = this.x + distance;
    let toY = this.route.groundAt(toX, this.y);
    if (toY === undefined) {
      const land = this.route.landing(toX - 4, 1);
      if (land === undefined) return false;
      toX = land + 6;
      toY = this.route.groundAt(toX, this.y) ?? this.y;
    }
    this.v = Math.max(this.v, this.heroV, GUIDE.walk);
    this.jump({ x: toX, y: toY }, GUIDE.hopTime, GUIDE.hopLift + Math.max(0, this.y - toY));
    return true;
  }

  private jump(to: Position, duration: number, height: number): void {
    this.hop = { from: { x: this.x, y: this.y }, to, t: 0, duration, height };
    this.hopReadyAt = this.clock + duration + GUIDE.hopCooldown;
  }

  /** Any stop he has now reached: a pause if the hero lags, the point at the shed roof, the pond at the end. */
  private passStops(hero: Position): void {
    const gap = this.gap(hero);
    while (this.stop && this.x >= this.stop.x - 0.5) {
      const stop = this.stop;
      if (stop.act === 'pond') { this.x = stop.x; this.y = this.route.groundAt(this.x, this.y) ?? this.y; this.v = 0; return this.enter('at-pond'); }
      this.next++;
      if (stop.act === 'point' && gap > GUIDE.hopGap) { this.v = 0; return this.enter('point'); }
      // He pauses only for a hero lagging behind, not one already coming on.
      if (stop.act === 'wait' && gap > GUIDE.pauseAt && this.heroV < GUIDE.walk * 0.5) return this.waitFor(GUIDE.pauseResume);
    }
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
    this.landedAt = this.clock;
    return false;
  }

  private enter(state: GuideState): void {
    this.state = state;
    this.elapsed = 0;
  }

  private view(hero: Position): GuideView {
    const gap = this.gap(hero);
    let anim: GuideAnim = 'wait';
    let rate = 1;
    if (this.hop) anim = 'hop';
    else if (this.state === 'sit') anim = 'sit';
    else if (this.state === 'wake') anim = this.elapsed < GUIDE.wakeLook ? 'look' : 'bow';
    else if (this.state === 'lead') {
      anim = this.v > GUIDE.walk * 1.15 ? 'run' : this.v > 4 ? 'walk' : 'wait';
      // The walk clip (6 frames at 12 fps) suits ~1.5 m/s; it speeds up with him, and bounds faster when running.
      rate = Math.max(0.6, Math.min(2.4, this.v / GUIDE.walk));
    } else if (this.state === 'point' || this.state === 'at-pond') anim = 'point';
    else if (this.state === 'wait') {
      const since = this.elapsed - GUIDE.lookBack;
      const cycle = Math.floor(Math.max(0, since) / GUIDE.beckonEvery);
      const beckoning = since >= 0 && since % GUIDE.beckonEvery < GUIDE.beckonFor;
      if (since < 0) anim = 'look';
      else if (gap > GUIDE.veryFar) anim = 'sweat';
      // He beckons while the hero is further than the distance he waits for ("come on"), sweating once it drags on.
      else if (beckoning && gap > this.resumeAt) anim = this.elapsed > GUIDE.sweatAfter && cycle % 2 === 1 ? 'sweat' : 'beckon';
    }
    const squash = Math.max(0, 1 - (this.clock - this.landedAt) / GUIDE.squash);
    return { x: this.x, y: this.y, anim, facing: this.facing, state: this.state, rate, squash };
  }
}

const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);

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
