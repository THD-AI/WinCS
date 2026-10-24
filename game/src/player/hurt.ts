import type { AnimationTable } from '../stage/assets';
import { KNOCK_TIME, type Life } from '../combat/life';

export interface Pose { board: string; frame: string }
const name = (clip: string, n: number) => `${clip}-${String(n).padStart(2, '0')}`;
/** `hit-00` is the drawn white flash and `hit-03` the crouch the knockback ends in (hero-hurt board). */
export const RECOVER_FROM = 3;

/**
 * The drawn hurt and death clips at their own fps (anims.json), replacing the generic white tint.
 * A one-heart hit plays `hit` (flash, recoil, crouch, recover); a heavier hit throws the hero with `knockback`
 * over the knock time and recovers through the rest of `hit`. Moving away cuts the recovery short; the
 * invulnerability blink stays.
 */
export class HurtAnimation {
  private elapsed = -1;
  private heavy = false;
  constructor(private hurt: AnimationTable, private death: AnimationTable) {}
  start(damage: number) { this.elapsed = 0; this.heavy = damage >= 2 && !!this.hurt.knockback; }
  cancel() { this.elapsed = -1; }
  get active() { return this.elapsed >= 0; }
  /** `moving`: the body has its own motion again (input after the knock), which ends the recovery. */
  update(life: Life, dt: number, moving: boolean): Pose | null {
    if (life.dead > 0) {
      const clip = this.death.death;
      const frames = clip?.frames ?? 12, fps = clip?.fps ?? 12;
      const time = 1 - life.dead; // `dead` counts down from 1 s
      return { board: 'hero-death', frame: name('death', Math.min(frames - 1, Math.floor(time * fps))) };
    }
    if (this.elapsed < 0) return null;
    this.elapsed += dt;
    if (life.knock === 0 && moving) { this.elapsed = -1; return null; }
    const hit = this.hurt.hit, knock = this.hurt.knockback;
    if (!hit) { this.elapsed = -1; return null; }
    let t = this.elapsed;
    if (this.heavy && knock) {
      const length = Math.max(KNOCK_TIME, knock.frames / knock.fps);
      if (t < length) return { board: 'hero-hurt', frame: name('knockback', Math.min(knock.frames - 1, Math.floor(t / length * knock.frames))) };
      t = t - length + RECOVER_FROM / hit.fps;
    }
    const frame = Math.floor(t * hit.fps);
    if (frame >= hit.frames) { this.elapsed = -1; return null; }
    return { board: 'hero-hurt', frame: name('hit', frame) };
  }
  /** Blink while invulnerable, once the drawn clip has finished (the flash frame is in the clip). */
  alpha(life: Life, time: number) {
    return life.dead === 0 && !this.active && life.invulnerable > 0 && Math.floor(time / 80) % 2 ? 0.35 : 1;
  }
}
