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
/**
 * Charge speed in px/s, per phase: a race car, faster than the hero's 258 px/s run. Tuned for the narrow arena
 * (P8): a standing full jump keeps the hero's feet above her body for ~0.53 s, and she passes under in that time
 * (jumpable()).
 */
export const SPEED = [540, 600, 660];
/** Seconds of stall smoke before she is gone and `boss-defeated` fires. */
export const STALL_SECONDS = 1.2;
/** Seconds of revving before a charge: the rev clip loops until then (docs/05: 1 s). The tell: she shakes and smokes. */
export const REV_SECONDS = 1;
/**
 * Phase 2's turn at the wall: instead of reversing at once she stops and revs again this long – a shorter tell,
 * but a tell, so the second charge is never a surprise.
 */
export const TURN_REV_SECONDS = 0.5;
/** The last seconds of a stun: the hazard light blinks faster, so you know to back off before she reboots. */
export const STUN_WARNING = 0.7;
/** After her charge hits the hero she brakes this long, at this share of her speed, so the impact reads (P8). */
export const BUMP_SECONDS = 0.25, BUMP_SPEED = 0.35;
/** A part bounces (keeping this share of its fall speed), then lies on the floor as a hazard this long, blinking at the end. */
export const PART_BOUNCE = 0.45, PART_SECONDS = 2.5, PART_BLINK = 0.6;
/**
 * Her hit box: the car body without the rear wing, inside the ~290 × 134 px sprite (measured on rev-00). It is
 * the body under the cockpit, well below the hero's 96 px full jump, so you can jump her charge as docs/05 asks
 * (P8); x is her centre, y the floor.
 */
export const JENNY_BOX = { w: 250, h: 56 };
const GRAVITY = 1400;

export interface Part { kind: string; x: number; y: number; vx: number; vy: number; landed: number; rolling: boolean; bounces: number }
export interface Arena { left: number; right: number; floor: number }

export class JennyFight {
  phase: JennyPhase = 'waiting';
  health = JENNY_HEALTH;
  /** -1 nose left, 1 nose right. */
  facing: -1 | 1 = -1;
  x: number;
  elapsed = 0;
  parts: Part[] = [];
  /** Seconds of braking left after her charge hit the hero. */
  bump = 0;
  /** Phase 2's first charge turns at the wall instead of crashing. */
  private turnsLeft = 0;
  /** How long the current rev lasts: the full tell, or the shorter one after a turn. */
  private revFor = REV_SECONDS;
  private seed = 1;

  constructor(readonly arena: Arena, readonly spawnX: number, private clips: AnimationTable) {
    this.x = spawnX;
  }

  /** 0, 1 or 2. */
  get stage(): number { return this.health > PHASE_AT[0] ? 0 : this.health > PHASE_AT[1] ? 1 : 2; }
  get active(): boolean { return this.phase !== 'waiting' && this.phase !== 'gone'; }
  get bounds() { return { x: this.x - JENNY_BOX.w / 2, y: this.arena.floor - JENNY_BOX.h, ...JENNY_BOX }; }
  /** Where a hit does damage now: her open back (the tail), or the whole car while she is stunned or crashing. */
  get open(): 'back' | 'all' | 'none' {
    if (!this.active || this.phase === 'stall') return 'none';
    return this.phase === 'stunned' || this.phase === 'crash' ? 'all' : 'back';
  }
  /** The tail's x: the end away from her nose. */
  get tailX(): number { return this.x - this.facing * JENNY_BOX.w / 2; }
  /** The rev tell's shake in px (0 outside the rev), growing as the charge comes. */
  get shake(): number {
    if (this.phase !== 'rev') return 0;
    return Math.round(Math.sin(this.elapsed * 70) * (1 + 2 * Math.min(1, this.elapsed / this.revFor)));
  }
  /** Seconds of the current stun left (0 outside it). */
  get stunLeft(): number { return this.phase === 'stunned' ? Math.max(0, STUN[this.stage] - this.elapsed) : 0; }
  /** Her charge hit the hero: she brakes for a moment, so the impact reads instead of driving through. */
  bumped(): void { if (this.phase === 'charge') this.bump = BUMP_SECONDS; }

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
    if (this.phase === 'waiting') this.enter('rev', REV_SECONDS);
  }

  /** Back to the start of the fight (the hero died). A beaten Jenny stays beaten. */
  reset(): void {
    if (this.phase === 'stall' || this.phase === 'gone') return;
    this.phase = 'waiting'; this.health = JENNY_HEALTH; this.facing = -1; this.x = this.spawnX;
    this.elapsed = 0; this.parts = []; this.turnsLeft = 0; this.bump = 0; this.revFor = REV_SECONDS;
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

  /**
   * Damage her body does on contact in this phase: only the charge hurts. Revving she stands still (the tell), and
   * stunned, crashed or rebooting she is the thing you hit – standing next to her is never punished.
   */
  get contactDamage(): number {
    return this.phase === 'charge' ? CHARGE_DAMAGE : 0;
  }

  /**
   * The damage of touching her with the hero's centre at `heroX`: her charge hurts with her front half, nose first.
   * A hero behind her centre – left at the tail as she pulls away, or dropping onto her back after a jump – is
   * not run over by a car driving away from him.
   */
  contactAt(heroX: number): number {
    return (heroX - this.x) * this.facing >= 0 ? this.contactDamage : 0;
  }

  /** Advance; returns true exactly once, when the stall ends and she is beaten. */
  step(seconds: number): boolean {
    let beaten = false;
    let remaining = Math.min(seconds, 0.1);
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120); remaining -= dt; this.elapsed += dt;
      this.stepParts(dt);
      switch (this.phase) {
        case 'rev': if (this.elapsed >= this.revFor) this.enter('charge'); break;
        case 'charge': {
          this.x += this.facing * SPEED[this.stage] * (this.bump > 0 ? BUMP_SPEED : 1) * dt;
          this.bump = Math.max(0, this.bump - dt);
          const wall = this.facing < 0 ? this.arena.left + JENNY_BOX.w / 2 : this.arena.right - JENNY_BOX.w / 2;
          if ((this.x - wall) * this.facing >= 0) {
            this.x = wall;
            // Phase 2 turns here: she stops, faces back and revs a shorter tell before the second charge.
            if (this.turnsLeft > 0) { this.turnsLeft--; this.facing = -this.facing as -1 | 1; this.bump = 0; this.enter('rev', TURN_REV_SECONDS); }
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
            this.enter('rev', REV_SECONDS);
          }
          break;
        case 'stall': if (this.elapsed >= STALL_SECONDS) { this.enter('gone'); beaten = true; } break;
      }
    }
    return beaten;
  }

  private enter(phase: JennyPhase, revFor = REV_SECONDS): void { this.phase = phase; this.elapsed = 0; this.revFor = revFor; }

  /** Parts fly back out of the crash in arcs: spring, bolt, wing shard … (debris-1…5); phase 2 adds a rolling wheel. */
  private shed(): void {
    const count = PARTS[this.stage];
    for (let i = 0; i < count; i++) {
      const kind = `debris-${(i % 5) + 1}`;
      const spread = (i + 1) / count;
      this.parts.push({ kind, x: this.x, y: this.arena.floor - JENNY_BOX.h * 0.6,
        vx: -this.facing * (140 + 360 * spread + 40 * this.random()), vy: -(380 + 220 * this.random()), landed: 0,
        rolling: this.stage === 1 && i === count - 1, bounces: 0 });
    }
  }

  private stepParts(dt: number): void {
    for (const p of this.parts) {
      if (p.landed > 0 && !p.rolling) { p.landed += dt; continue; }
      p.x += p.vx * dt;
      if (p.landed === 0) {
        p.vy += GRAVITY * dt; p.y += p.vy * dt;
        if (p.y >= this.arena.floor) {
          p.y = this.arena.floor;
          // It bounces (twice at most), skidding slower each time, then lies there.
          if (p.bounces < 2 && p.vy > 120) { p.bounces++; p.vy = -p.vy * PART_BOUNCE; p.vx *= 0.6; }
          else { p.landed = dt; p.vx = p.rolling ? Math.sign(p.vx) * 300 : 0; }
        }
      } else p.landed += dt;
      if (p.x < this.arena.left || p.x > this.arena.right) {
        p.x = Math.max(this.arena.left, Math.min(this.arena.right, p.x));
        if (p.rolling) p.landed = Math.max(p.landed, 99); else p.vx = -p.vx * 0.5;
      }
    }
    // A landed part lies there as a hazard, then it's gone; a rolling wheel leaves at the wall.
    this.parts = this.parts.filter(p => p.landed < (p.rolling ? 99 : PART_SECONDS));
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

/** A landed part about to vanish blinks. */
export function blinking(p: Part): boolean { return !p.rolling && p.landed > PART_SECONDS - PART_BLINK; }

/**
 * Whether a standing full jump clears her charge at `speed`: the time the hero's feet stay above her body must
 * cover the time her body and his take to pass each other (the hero's jump: 485 px/s up, 1200 px/s² gravity).
 */
export function jumpable(speed: number, jumpSpeed = 485, gravity = 1200, heroWidth = 28): boolean {
  const disc = jumpSpeed * jumpSpeed - 2 * gravity * JENNY_BOX.h;
  if (disc <= 0) return false;
  const above = (2 * Math.sqrt(disc)) / gravity;
  return (JENNY_BOX.w + heroWidth) / speed <= above;
}
