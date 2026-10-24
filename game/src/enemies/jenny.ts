import type { AnimationTable } from '../stage/assets';

/**
 * Jenny, the Region 1 boss (docs/05, #57) as pure state. She revs, charges across the arena nose first, crashes
 * into the far wall, sheds parts and sits stunned; then she reboots, turns round and goes again. Her nose is
 * armoured: chair hits land from behind, or anywhere while she is stunned. Three phases by health. Clip lengths
 * come from her approved animations (boss-jenny*.anims.json), never from constants in code.
 */
export type JennyPhase = 'waiting' | 'rev' | 'charge' | 'crash' | 'stunned' | 'reboot' | 'stall' | 'gone';

export const JENNY_HEALTH = 30;
/** Health where phase 2 and phase 3 begin. */
export const PHASE_AT = [20, 10] as const;
/** docs/05: charge 2 cells, parts 1; stunned 3 s (2 s in phase 3); 3 parts per crash (5 in phase 3). */
export const CHARGE_DAMAGE = 2, PART_DAMAGE = 1;
const STUN = [3, 3, 2], PARTS = [3, 4, 5];
/** Charge speed in px/s, per phase: she is a race car, faster than the hero's 258 px/s run. */
const SPEED = [520, 600, 680];
/** Seconds of stall smoke before she is gone and `boss-defeated` fires. */
export const STALL_SECONDS = 1.2;
/** Seconds of revving before a charge: the rev clip loops until then (docs/05: 1 s). */
export const REV_SECONDS = 1;
/**
 * Her hit box: the car body without the rear wing, inside the ~290 × 134 px sprite (measured on rev-00). It is
 * lower than the hero's ~88 px jump, so you can jump her charge as docs/05 asks; x is her centre, y the floor.
 */
export const JENNY_BOX = { w: 250, h: 70 };
const GRAVITY = 1400;

export interface Part { kind: string; x: number; y: number; vx: number; vy: number; landed: number; rolling: boolean }
export interface Arena { left: number; right: number; floor: number }

export class JennyFight {
  phase: JennyPhase = 'waiting';
  health = JENNY_HEALTH;
  /** -1 nose left, 1 nose right. */
  facing: -1 | 1 = -1;
  x: number;
  elapsed = 0;
  parts: Part[] = [];
  /** Phase 2's first charge turns at the wall instead of crashing. */
  private turnsLeft = 0;
  private seed = 1;

  constructor(readonly arena: Arena, readonly spawnX: number, private clips: AnimationTable) {
    this.x = spawnX;
  }

  /** 0, 1 or 2. */
  get stage(): number { return this.health > PHASE_AT[0] ? 0 : this.health > PHASE_AT[1] ? 1 : 2; }
  get active(): boolean { return this.phase !== 'waiting' && this.phase !== 'gone'; }
  get bounds() { return { x: this.x - JENNY_BOX.w / 2, y: this.arena.floor - JENNY_BOX.h, ...JENNY_BOX }; }

  /** Seconds one pass of a clip takes, from its frames and fps. */
  clip(name: string): number {
    const c = this.clips[name];
    return c ? c.frames / c.fps : 0.3;
  }

  /** The current frame name, from the clip that plays in this phase. */
  get frame(): { atlas: 'boss-jenny' | 'boss-jenny-2'; name: string } {
    const pick = (atlas: 'boss-jenny' | 'boss-jenny-2', clip: string, loop: boolean) => {
      const c = this.clips[clip] ?? { frames: 1, fps: 12, loop };
      const n = Math.floor(this.elapsed * c.fps);
      return { atlas, name: `${clip}-${String(loop ? n % c.frames : Math.min(c.frames - 1, n)).padStart(2, '0')}` };
    };
    switch (this.phase) {
      case 'charge': return pick('boss-jenny', 'charge', true);
      case 'crash': return pick('boss-jenny', 'crash', false);
      case 'stunned': case 'stall': case 'gone': return pick('boss-jenny-2', 'stunned', true);
      case 'reboot': return pick('boss-jenny-2', 'reboot', false);
      default: return pick('boss-jenny', 'rev', true);
    }
  }

  start(): void {
    if (this.phase === 'waiting') this.enter('rev');
  }

  /** Back to the start of the fight (the hero died). A beaten Jenny stays beaten. */
  reset(): void {
    if (this.phase === 'stall' || this.phase === 'gone') return;
    this.phase = 'waiting'; this.health = JENNY_HEALTH; this.facing = -1; this.x = this.spawnX;
    this.elapsed = 0; this.parts = []; this.turnsLeft = 0;
  }

  /** A chair hit travelling in `direction`. True if it did damage; false if the armoured nose took it. */
  hit(damage: number, direction: number): boolean {
    if (!this.active || this.phase === 'stall' || this.health <= 0) return false;
    const fromBehind = Math.sign(direction) === this.facing;
    if (!fromBehind && this.phase !== 'stunned' && this.phase !== 'crash') return false;
    this.health = Math.max(0, this.health - damage);
    if (this.health === 0) { this.enter('stall'); this.parts = []; }
    return true;
  }

  /** Damage her body does to the hero on contact in this phase. */
  get contactDamage(): number {
    return this.phase === 'charge' ? CHARGE_DAMAGE : this.phase === 'rev' ? 1 : 0;
  }

  /** Advance; returns true exactly once, when the stall ends and she is beaten. */
  step(seconds: number): boolean {
    let beaten = false;
    let remaining = Math.min(seconds, 0.1);
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120); remaining -= dt; this.elapsed += dt;
      this.stepParts(dt);
      switch (this.phase) {
        case 'rev': if (this.elapsed >= REV_SECONDS) this.enter('charge'); break;
        case 'charge': {
          this.x += this.facing * SPEED[this.stage] * dt;
          const wall = this.facing < 0 ? this.arena.left + JENNY_BOX.w / 2 : this.arena.right - JENNY_BOX.w / 2;
          if ((this.x - wall) * this.facing >= 0) {
            this.x = wall;
            if (this.turnsLeft > 0) { this.turnsLeft--; this.facing = -this.facing as -1 | 1; this.elapsed = 0; }
            else { this.enter('crash'); this.shed(); }
          }
          break;
        }
        case 'crash': if (this.elapsed >= this.clip('crash')) this.enter('stunned'); break;
        case 'stunned': if (this.elapsed >= STUN[this.stage]) this.enter('reboot'); break;
        case 'reboot':
          if (this.elapsed >= this.clip('reboot')) {
            this.facing = -this.facing as -1 | 1;
            this.turnsLeft = this.stage === 1 ? 1 : 0;
            this.enter('rev');
          }
          break;
        case 'stall': if (this.elapsed >= STALL_SECONDS) { this.enter('gone'); beaten = true; } break;
      }
    }
    return beaten;
  }

  private enter(phase: JennyPhase): void { this.phase = phase; this.elapsed = 0; }

  /** Parts fly back out of the crash in arcs: spring, bolt, wing shard … (debris-1…5); phase 2 adds a rolling wheel. */
  private shed(): void {
    const count = PARTS[this.stage];
    for (let i = 0; i < count; i++) {
      const kind = `debris-${(i % 5) + 1}`;
      const spread = (i + 1) / count;
      this.parts.push({ kind, x: this.x, y: this.arena.floor - JENNY_BOX.h * 0.6,
        vx: -this.facing * (140 + 360 * spread + 40 * this.random()), vy: -(380 + 220 * this.random()), landed: 0,
        rolling: this.stage === 1 && i === count - 1 });
    }
  }

  private stepParts(dt: number): void {
    for (const p of this.parts) {
      if (p.landed > 0 && !p.rolling) { p.landed += dt; continue; }
      p.x += p.vx * dt;
      if (p.landed === 0) {
        p.vy += GRAVITY * dt; p.y += p.vy * dt;
        if (p.y >= this.arena.floor) { p.y = this.arena.floor; p.landed = dt; p.vx = p.rolling ? Math.sign(p.vx) * 300 : 0; }
      } else p.landed += dt;
      if (p.x < this.arena.left || p.x > this.arena.right) p.landed = Math.max(p.landed, 99);
    }
    // A landed part lies there a second, then it's gone; a rolling wheel leaves at the wall.
    this.parts = this.parts.filter(p => p.landed < (p.rolling ? 99 : 1.2));
  }

  /** Deterministic jitter so tests and replays match. */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

/** The arena from collision: the boss gate's right edge, the end of the floor under her spawn, its height. */
export function arenaFrom(gate: { x: number; w: number }, spawn: { x: number; y: number }, walk: [number, number][][]): Arena {
  const floor = walk.find(line => line.length >= 2 && line[0][0] <= spawn.x && line[line.length - 1][0] >= spawn.x
    && line.some(p => Math.abs(p[1] - spawn.y) <= 4));
  const right = floor ? Math.max(...floor.filter(p => Math.abs(p[1] - spawn.y) <= 4).map(p => p[0])) : spawn.x + 300;
  return { left: gate.x + gate.w, right, floor: spawn.y };
}
