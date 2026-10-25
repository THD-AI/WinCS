import { intersects, type Damageable, type Rect } from './sweeps';
import { frameTime, type Clips } from './clips';

/**
 * The low sweep (playtest 24 Oct: rovers and crabs crawl under a chest-high swing): ↓ + Act on the ground drives the
 * chair down along the floor. No new art – it plays the slam's own floor poses from `chair-overhead` (02 the chair
 * coming down, 03 planted on the floor with its dust, 04 the follow-through), five poses at the slam's own speed.
 * Measured on the 1.5x slam-03 (cell 160×187, feet 80,187): seat and legs run 12…56 px ahead, the dust to ~60 px,
 * the seat 51 px up – a floor-level box that reaches a little further than the side swing (50 px).
 */
export const LOW_CONTACT = { inner: 12, reach: 75, top: 51, bottom: 0 } as const; // 30 % past the drawn chair, as the side swing
export const LOW_POSES = ['slam-02', 'slam-03', 'slam-03', 'slam-04', 'slam-04'] as const;
/** The poses with the chair on the floor. */
export const LOW_HIT_FRAMES: readonly number[] = [1, 2];

export class LowSweep {
  active = false;
  frame = 0;
  direction: -1 | 1 = 1;
  private elapsed = 0;
  private struck = new Set<string>();
  /** `clips`: chair-overhead.anims.json – the poses are the slam's. */
  constructor(private clips?: Clips) {}
  begin(direction: -1 | 1) {
    if (this.active) return false;
    this.active = true; this.direction = direction; this.frame = 0; this.elapsed = 0; this.struck.clear();
    return true;
  }
  cancel() { this.active = false; this.frame = 0; this.elapsed = 0; this.struck.clear(); }
  step(dt: number) {
    if (!this.active) return;
    this.elapsed += dt;
    const frame = frameTime(this.clips, 'slam');
    while (this.active && this.elapsed + 1e-9 >= frame) {
      this.elapsed = Math.max(0, this.elapsed - frame); this.frame++;
      if (this.frame >= LOW_POSES.length) this.cancel();
    }
  }
  get pose(): string | undefined { return this.active ? LOW_POSES[this.frame] : undefined; }
  box(feet: { x: number; y: number }): Rect | null {
    if (!this.active || !LOW_HIT_FRAMES.includes(this.frame)) return null;
    const { inner, reach, top, bottom } = LOW_CONTACT;
    return { x: feet.x + (this.direction > 0 ? inner : -reach), y: feet.y - top, w: reach - inner, h: top - bottom };
  }
  hit(feet: { x: number; y: number }, targets: Iterable<Damageable>) {
    const box = this.box(feet), hits: Rect[] = [];
    if (!box) return hits;
    for (const target of targets) {
      const bounds = target.bounds();
      if (target.active?.() === false || this.struck.has(target.id) || !intersects(box, bounds)) continue;
      this.struck.add(target.id);
      if (target.hit({ damage: 1, direction: this.direction, position: { ...feet }, kind: 'sweep' })) hits.push(bounds);
    }
    return hits;
  }
}
