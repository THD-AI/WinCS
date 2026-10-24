import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import { TURN_SECONDS } from './rover';
import { WALK_SPEED } from '../player/movement';
import type { Position } from '../core/events';
import type { Rect } from '../combat/sweeps';

/**
 * The crab (docs/05, P7): a six-legged hexapod that creeps toward you, rears up with its front legs raised for
 * 0.6 s (the tell) and stabs forward. Four chair hits. Modelled on rover.ts; frames from enemy-crab.anims.json
 * (idle 4, walk 8, stab 5, collapse 5, all 12 fps).
 */
export const CRAB_WIDTH = 44, CRAB_HEIGHT = 36, CRAB_HEALTH = 4;
export const CRAB_TELL = 0.6, CRAB_SPEED = WALK_SPEED / 3, CRAB_SPOT = 110;
/** The stab reaches this far past its front (px) during the stab clip's middle frames. */
export const STAB_REACH = 30;
/**
 * It raises its legs only when the stab would land: the hero's centre within its half-width, the stab and the hero's
 * half-width (less a 4 px bite). Further off – up to CRAB_SPOT – it creeps toward the hero instead of stabbing air.
 */
export const CRAB_STRIKE = CRAB_WIDTH / 2 + STAB_REACH + BODY_WIDTH / 2 - 4;
const STAB_SECONDS = 5 / 12, COLLAPSE_SECONDS = 5 / 12, HIT_SECONDS = 3 / 12, RECOVER = 0.5;
export type CrabPhase = 'walk' | 'tell' | 'stab' | 'recover' | 'hit' | 'collapse' | 'dead';

export class Crab {
  x: number;
  readonly y: number;
  health = CRAB_HEALTH;
  phase: CrabPhase = 'walk';
  direction: -1 | 1 = -1;
  elapsed = 0;
  private hitDirection = 1;
  /** Seconds left idling at a patrol end before it turns. */
  turning = 0;
  /** Whether it moved in the last step (its legs walk only then). */
  private moving = true;
  constructor(readonly spawn: Position, readonly patrol: [number, number]) { this.x = spawn.x; this.y = spawn.y; }
  private enter(phase: CrabPhase) { this.phase = phase; this.elapsed = 0; this.turning = 0; this.moving = true; }
  reset() { this.x = this.spawn.x; this.health = CRAB_HEALTH; this.direction = -1; this.enter('walk'); }
  get bounds(): Rect { return { x: this.x - CRAB_WIDTH / 2, y: this.y - CRAB_HEIGHT, w: CRAB_WIDTH, h: CRAB_HEIGHT }; }
  /** The stab's reach while its legs are out (frames 2–3 of 5), else undefined. */
  get attack(): Rect | undefined {
    if (this.phase !== 'stab' || this.elapsed < 2 / 12 || this.elapsed >= 4 / 12) return undefined;
    const front = this.x + this.direction * CRAB_WIDTH / 2;
    return { x: this.direction > 0 ? front : front - STAB_REACH, y: this.y - CRAB_HEIGHT, w: STAB_REACH, h: CRAB_HEIGHT };
  }
  hit(damage: number, direction: number) {
    if (this.health <= 0 || this.phase === 'hit') return false;
    this.health = Math.max(0, this.health - damage); this.hitDirection = direction;
    this.enter(this.health ? 'hit' : 'collapse'); return true;
  }
  /** Returns true exactly when the collapse ends. */
  step(seconds: number, hero?: Position) {
    let defeated = false, remaining = seconds;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120); remaining -= dt; this.elapsed += dt;
      switch (this.phase) {
        case 'walk': {
          const near = hero && Math.abs(hero.y - this.y) <= BODY_HEIGHT / 2 && Math.abs(hero.x - this.x) <= CRAB_SPOT;
          if (near) {
            // Spotted: face the hero and creep closer (never past its patrol end), and rear up once the stab would reach.
            this.direction = hero!.x >= this.x ? 1 : -1; this.turning = 0;
            if (Math.abs(hero!.x - this.x) <= CRAB_STRIKE) { this.enter('tell'); break; }
            const x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x + this.direction * CRAB_SPEED * dt));
            this.moving = x !== this.x; this.x = x;
            break;
          }
          this.moving = !this.turning;
          if (this.turning > 0) {
            this.turning -= dt;
            if (this.turning <= 1e-9) { this.turning = 0; this.direction = this.x <= this.patrol[0] ? 1 : -1; }
            break;
          }
          this.x += this.direction * CRAB_SPEED * dt;
          if (this.x <= this.patrol[0] || this.x >= this.patrol[1]) {
            this.x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x));
            // Turn back inward after a pause; already facing inward (pushed to an end), it simply walks on.
            if ((this.x <= this.patrol[0] ? 1 : -1) !== this.direction) this.turning = TURN_SECONDS;
          }
          break;
        }
        case 'tell': if (this.elapsed >= CRAB_TELL) this.enter('stab'); break;
        case 'stab': if (this.elapsed >= STAB_SECONDS) this.enter('recover'); break;
        case 'recover': if (this.elapsed >= RECOVER) this.enter('walk'); break;
        case 'hit':
          this.x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x + this.hitDirection * 40 * dt));
          if (this.elapsed >= HIT_SECONDS) this.enter('recover');
          break;
        case 'collapse': if (this.elapsed >= COLLAPSE_SECONDS) { this.enter('dead'); defeated = true; } break;
      }
    }
    return defeated;
  }
  get pose() {
    const n = Math.floor((this.elapsed + 1e-9) * 12);
    const f = (clip: string, i: number) => `${clip}-${String(i).padStart(2, '0')}`;
    switch (this.phase) {
      case 'walk': return this.moving ? f('walk', n % 8) : f('idle', n % 4);
      case 'tell': return f('stab', Math.min(1, n)); // front legs raised and held
      case 'stab': return f('stab', Math.min(4, 1 + n));
      case 'collapse': return f('collapse', Math.min(4, n));
      case 'dead': return f('collapse', 4);
      default: return f('idle', n % 4);
    }
  }
}
