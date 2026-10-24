/**
 * The dodge-dash (playtest 24 Oct, Alexander: "dash and/or dodge, whichever is best" – one move): a quick
 * horizontal burst that passes through enemies and Jenny's charge. On the ground any time, in the air once per jump
 * (back on landing), never on a ladder or during an interaction. It holds the height in the air (no fall while it
 * lasts), and the hero takes no damage for most of it. Pure, so the timing is tested; player.ts moves the body with
 * the normal wall and floor collision, so a dash never goes through a wall.
 */
export const DODGE_DISTANCE = 120;
export const DODGE_TIME = 0.2;
export const DODGE_SPEED = DODGE_DISTANCE / DODGE_TIME; // 600 px/s, three times the run
/** Untouchable for the first 0.16 s of the 0.2 s: the last frames can still be caught. */
export const DODGE_INVULNERABLE = 0.16;
/** From the end of one dash to the next. */
export const DODGE_COOLDOWN = 0.45;

export class Dodge {
  direction: -1 | 1 = 1;
  remaining = 0;
  cooldown = 0;
  /** The air dash of this jump is spent; landing gives it back. */
  airUsed = false;
  private elapsed = 0;
  get active() { return this.remaining > 1e-9; }
  get invulnerable() { return this.active && this.elapsed + 1e-9 < DODGE_INVULNERABLE; }
  start(direction: -1 | 1, grounded: boolean) {
    if (this.active || this.cooldown > 1e-9 || !grounded && this.airUsed) return false;
    if (!grounded) this.airUsed = true;
    this.direction = direction; this.remaining = DODGE_TIME; this.elapsed = 0;
    return true;
  }
  /** Feet on the ground (and no dash running): the air dash is back. */
  land() { if (!this.active) this.airUsed = false; }
  /** Damage or a ladder ends it at once; the cooldown still applies. */
  cancel() { if (this.active) { this.remaining = 0; this.cooldown = DODGE_COOLDOWN; } }
  /** Advances by dt and returns the distance moved in it (px, signed). */
  step(dt: number) {
    if (!this.active) { this.cooldown = Math.max(0, this.cooldown - dt); return 0; }
    const moving = Math.min(dt, this.remaining);
    this.remaining -= moving; this.elapsed += moving;
    if (this.remaining <= 1e-9) { this.remaining = 0; this.cooldown = DODGE_COOLDOWN; }
    return this.direction * DODGE_SPEED * moving;
  }
}
