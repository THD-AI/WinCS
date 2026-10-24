import { BODY_WIDTH } from '../player/body';
export const GUARD_DISTANCE = BODY_WIDTH / 2; // docs/02: small push = half the 28 px body.
export const GUARD_PUSH_TIME = 3 / 12; // docs/02: three authored frames, kinematic collision retained.
type Phase = 'idle' | 'up' | 'hold' | 'impact' | 'break';

export class Guard {
  phase: Phase = 'idle';
  direction: -1 | 1 = 1;
  blocks = 0;
  private elapsed = 0;
  private consumed = false;
  private engaged = false;
  get active() { return this.phase === 'hold' || this.phase === 'impact' || this.phase === 'up' && this.elapsed + 1e-9 >= 2 / 12; }
  press(direction: -1 | 1) {
    if (this.phase !== 'idle') return false;
    this.direction = direction; this.phase = 'up'; this.elapsed = 0; this.blocks = 0;
    this.consumed = false; this.engaged = false; return true;
  }
  cancel() { this.phase = 'idle'; this.elapsed = 0; this.consumed = true; }
  release() {
    const tap = !this.consumed && !this.engaged && !this.active && this.phase !== 'break';
    if (this.phase !== 'break') this.cancel();
    return tap;
  }
  step(dt: number) {
    this.elapsed += dt;
    if (this.active) this.engaged = true;
    if ((this.phase === 'up' || this.phase === 'impact') && this.elapsed + 1e-9 >= 4 / 12) {
      this.phase = 'hold'; this.elapsed = Math.max(0, this.elapsed - 4 / 12);
    } else if (this.phase === 'break' && this.elapsed + 1e-9 >= 4 / 12) this.cancel();
  }
  receive(damage: number, sourceX: number, playerX: number) {
    if (!Number.isInteger(damage) || damage <= 0) throw new Error('Damage must be a positive integer');
    if (!this.active) return { blocked: false, fresh: false };
    if ((sourceX - playerX) * this.direction < 0) { this.cancel(); return { blocked: false, fresh: false }; }
    this.consumed = true; this.engaged = true;
    if (damage >= 2) { this.phase = 'break'; this.elapsed = 0; return { blocked: false, fresh: false }; }
    const fresh = this.phase !== 'impact';
    if (fresh) { this.phase = 'impact'; this.elapsed = 0; this.blocks++; }
    return { blocked: true, fresh };
  }
  get pose() {
    if (this.phase === 'idle') return undefined;
    const clip = this.phase === 'up' ? 'guard-up' : `guard-${this.phase}`;
    const frame = Math.floor((this.elapsed + 1e-9) * 12);
    return `${clip}-${String(this.phase === 'hold' ? frame % 3 : Math.min(3, frame)).padStart(2, '0')}`;
  }
}

export class GuardPush {
  remaining = 0;
  private direction = 1;
  start(direction: number) { this.remaining = GUARD_PUSH_TIME; this.direction = direction < 0 ? -1 : 1; }
  cancel() { this.remaining = 0; }
  step(dt: number) {
    const active = Math.min(dt, this.remaining); this.remaining = Math.max(0, this.remaining - active);
    if (this.remaining < 1e-9) this.remaining = 0;
    return this.direction * GUARD_DISTANCE / GUARD_PUSH_TIME * active;
  }
}
