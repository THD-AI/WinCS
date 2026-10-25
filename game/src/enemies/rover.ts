import { WALK_SPEED, RUN_SPEED } from '../player/movement';
import { BODY_HEIGHT } from '../player/body';
import type { Position } from '../core/events';
import { clipTime, frameAt, frameCount, type Clips } from '../combat/clips';

// docs/05: measured idle-00 alpha bounds and controller tuning.
// 3x since 24 Oct (Lex: the small robots were barely visible next to the 114 px hero): 75 px drawn.
export const ROVER_WIDTH = 93, ROVER_HEIGHT = 75;
export const TELL_SECONDS = 0.5, PATROL_SPEED = WALK_SPEED / 2, CHARGE_SPEED = RUN_SPEED;
/** How far ahead a rover's lidar spots the hero (px): its own range, no longer tied to the hero's walk speed. */
export const SPOT_RANGE = 150;
/** At a patrol end a rover (and a crab) stops this long, idling, before it turns back: no instant flip-flop. */
export const TURN_SECONDS = 0.3;
export type RoverPhase = 'patrol' | 'tell' | 'charge' | 'recover' | 'hit' | 'wreck' | 'dead';
export class Rover {
  x: number;
  readonly y: number;
  health = 3;
  phase: RoverPhase = 'patrol';
  direction: -1 | 1 = 1;
  elapsed = 0;
  private hitDirection = 1;
  /** Seconds left idling at a patrol end before it turns. */
  turning = 0;
  /** `clips`: enemy-rover.anims.json (idle, drive, charge, wreck). */
  constructor(readonly spawn: Position, readonly patrol: [number, number], private clips?: Clips) {
    this.x = spawn.x; this.y = spawn.y;
  }
  private enter(phase: RoverPhase) { this.phase = phase; this.elapsed = 0; this.turning = 0; }
  reset() { this.x = this.spawn.x; this.health = 3; this.direction = 1; this.enter('patrol'); }
  get bounds() { return { x: this.x - ROVER_WIDTH / 2, y: this.y - ROVER_HEIGHT, w: ROVER_WIDTH, h: ROVER_HEIGHT }; }
  hit(damage: number, direction: number) {
    if (!Number.isInteger(damage) || damage <= 0) throw new Error('Damage must be a positive integer');
    if (this.health <= 0 || this.phase === 'hit') return false;
    this.health = Math.max(0, this.health - damage); this.hitDirection = direction;
    this.enter(this.health ? 'hit' : 'wreck'); return true;
  }
  deflect(direction: number) {
    if (this.health <= 0 || this.phase === 'hit') return;
    this.hitDirection = direction; this.enter('hit');
  }
  /** Returns true exactly when the last wreck frame ends. Stage hit-stop pauses this clock. */
  step(seconds: number, hero?: Position) {
    let defeated = false, remaining = seconds;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120); remaining -= dt; this.elapsed += dt;
      switch (this.phase) {
        case 'patrol':
          if (hero && (hero.x - this.x) * this.direction > 0 && Math.abs(hero.x - this.x) <= SPOT_RANGE
            && Math.abs(hero.y - this.y) <= BODY_HEIGHT) { this.enter('tell'); break; }
          if (this.turning > 0) {
            this.turning -= dt;
            if (this.turning <= 1e-9) { this.turning = 0; this.direction = this.x <= this.patrol[0] ? 1 : -1; }
            break;
          }
          this.x += this.direction * PATROL_SPEED * dt;
          if (this.x <= this.patrol[0] || this.x >= this.patrol[1]) {
            this.x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x)); this.turning = TURN_SECONDS;
          }
          break;
        case 'tell': if (this.elapsed + 1e-9 >= TELL_SECONDS) this.enter('charge'); break;
        case 'charge':
          this.x += this.direction * CHARGE_SPEED * dt;
          if (this.x <= this.patrol[0] || this.x >= this.patrol[1]) {
            this.x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x)); this.direction = this.x <= this.patrol[0] ? 1 : -1;
            this.enter('recover');
          }
          break;
        case 'recover': if (this.elapsed + 1e-9 >= TELL_SECONDS) this.enter('patrol'); break;
        case 'hit':
          // knocked back half its width over three frames of its idle clip, flashing
          this.x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x + this.hitDirection * ROVER_WIDTH / 2 / clipTime(this.clips, 'idle', 3) * dt));
          if (this.elapsed + 1e-9 >= clipTime(this.clips, 'idle', 3)) this.enter('patrol');
          break;
        case 'wreck': if (this.elapsed + 1e-9 >= clipTime(this.clips, 'wreck', frameCount(this.clips, 'wreck', 5))) { this.enter('dead'); defeated = true; } break;
      }
    }
    return defeated;
  }
  get pose() {
    const frame = frameAt(this.clips, this.phase === 'patrol' && !this.turning ? 'drive' : this.phase === 'wreck' ? 'wreck' : this.phase === 'charge' ? 'charge' : 'idle', this.elapsed);
    if (this.phase === 'wreck' || this.phase === 'dead') return `wreck-${String(this.phase === 'dead' ? 4 : Math.min(4, frame)).padStart(2, '0')}`;
    if (this.phase === 'hit') return 'idle-00'; // The renderer flashes the living body white.
    if (this.phase === 'tell') return `charge-0${this.elapsed + 1e-9 < TELL_SECONDS / 2 ? 0 : 1}`;
    if (this.phase === 'charge') return `charge-0${2 + frame % 2}`;
    return this.phase === 'patrol' && !this.turning ? `drive-${String(frame % 6).padStart(2, '0')}` : `idle-${String(frame % 4).padStart(2, '0')}`;
  }
}
