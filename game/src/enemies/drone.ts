import { clipTime, frameAt, frameCount, type Clips } from '../combat/clips';
import type { Position } from '../core/events';
import type { Rect } from '../combat/sweeps';

/**
 * The drone (docs/05, P7): a quadcopter hovering at head height. When you walk under it, it tilts with its eye
 * flashing (the tell) and dives at you, then climbs back. Eight chair hits – in Region 1 you mostly avoid it.
 * Frames from enemy-drone.anims.json (hover 4, dive 3, crash 5, 12 fps).
 */
/**
 * Its box is the drawn quadcopter: hover-00's alpha bounds are 44 x 45 px, feet at the pivot (measured 24 Oct; the
 * old 22 px box covered only the lower half, so chair hits on the body you see went through – playtest M1).
 */
// 1.7x since 24 Oct (drawn 80 px, was 47): readable next to the 114 px hero.
export const DRONE_WIDTH = 77, DRONE_HEIGHT = 77, DRONE_HEALTH = 8;
export const DRONE_SPEED = 70, DRONE_TELL = 0.5, DIVE_SPEED = 380, CLIMB_SPEED = 160;
/** It dives when the hero is this close beneath it (px, horizontally). */
export const DRONE_SPOT = 50;
const DIVE_MAX = 0.6;
export type DronePhase = 'hover' | 'tell' | 'dive' | 'climb' | 'hit' | 'crash' | 'dead';

export class Drone {
  x: number;
  y: number;
  health = DRONE_HEALTH;
  phase: DronePhase = 'hover';
  direction: -1 | 1 = 1;
  elapsed = 0;
  private target = 0;
  /** `clips`: enemy-drone.anims.json (hover, dive, crash, screw). */
  constructor(readonly spawn: Position, readonly patrol: [number, number], private clips?: Clips) { this.x = spawn.x; this.y = spawn.y; }
  private enter(phase: DronePhase) { this.phase = phase; this.elapsed = 0; }
  reset() { this.x = this.spawn.x; this.y = this.spawn.y; this.health = DRONE_HEALTH; this.enter('hover'); }
  get bounds(): Rect { return { x: this.x - DRONE_WIDTH / 2, y: this.y - DRONE_HEIGHT, w: DRONE_WIDTH, h: DRONE_HEIGHT }; }
  /** It only hurts on the way down. */
  get dangerous() { return this.phase === 'dive'; }
  hit(damage: number, _direction: number) {
    if (this.health <= 0 || this.phase === 'hit') return false;
    this.health = Math.max(0, this.health - damage);
    this.enter(this.health ? 'hit' : 'crash'); return true;
  }
  /** Returns true exactly when the crash ends. `hero` is the hero's feet. */
  step(seconds: number, hero?: Position) {
    let defeated = false, remaining = seconds;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120); remaining -= dt; this.elapsed += dt;
      switch (this.phase) {
        case 'hover':
          if (hero && hero.y > this.y && Math.abs(hero.x - this.x) <= DRONE_SPOT) { this.target = hero.y - 30; this.enter('tell'); break; }
          this.x += this.direction * DRONE_SPEED * dt;
          if (this.x <= this.patrol[0] || this.x >= this.patrol[1]) {
            this.x = Math.max(this.patrol[0], Math.min(this.patrol[1], this.x)); this.direction = this.x <= this.patrol[0] ? 1 : -1;
          }
          break;
        case 'tell': if (this.elapsed >= DRONE_TELL) this.enter('dive'); break;
        case 'dive':
          this.y = Math.min(this.target, this.y + DIVE_SPEED * dt);
          if (this.y >= this.target || this.elapsed >= DIVE_MAX) this.enter('climb');
          break;
        case 'climb': case 'hit':
          this.y = Math.max(this.spawn.y, this.y - CLIMB_SPEED * dt);
          if (this.phase === 'hit' ? this.elapsed >= clipTime(this.clips, 'hover', 3) : this.y <= this.spawn.y) this.enter(this.y <= this.spawn.y ? 'hover' : 'climb');
          break;
        case 'crash':
          this.y += 200 * dt;
          if (this.elapsed >= clipTime(this.clips, 'crash', frameCount(this.clips, 'crash', 5))) { this.enter('dead'); defeated = true; }
          break;
      }
    }
    return defeated;
  }
  get pose() {
    const n = frameAt(this.clips, this.phase === 'tell' || this.phase === 'dive' ? 'dive' : this.phase === 'crash' ? 'crash' : 'hover', this.elapsed);
    const f = (clip: string, i: number) => `${clip}-${String(i).padStart(2, '0')}`;
    if (this.phase === 'tell' || this.phase === 'dive') return f('dive', Math.min(2, n));
    if (this.phase === 'crash') return f('crash', Math.min(4, n));
    if (this.phase === 'dead') return f('crash', 4);
    return f('hover', n % 4);
  }
}
