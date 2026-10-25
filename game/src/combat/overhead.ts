import { intersects, type Damageable, type Rect } from './sweeps';
import type { Position } from '../core/events';
import { RUN_SPEED } from '../player/movement';
import { clipTime, frameAt, frameCount, type Clips } from './clips';

/**
 * docs/02: measured on the 1.5x chair-overhead frames (24 Oct), cell 160×187, foot pivot (80,187). In up-02/03 the
 * chair spans −4…64 px ahead and 118…181 px up; the box reaches down to 88 px – the arc the chair travels from the
 * shoulder – so a drone hovering at head height is hit: the Rusty Creek drone (y 470, 45 px tall) sits 66–111 px above
 * the 536 deck and 100–145 px above the 570 ground. Slam-03's legs run 16…56 px ahead.
 */
export const UP_CONTACT = { left: -4, right: 64, top: 181, bottom: 88 } as const;
export const SLAM_CONTACT = { left: 16, right: 56, grain: 2 } as const;
export const SLAM_SPEED = RUN_SPEED * 2; // Initial tuning in docs/02, 516 px/s.
type Phase = 'idle' | 'up' | 'windup' | 'descend' | 'land' | 'pogo';
export class Overhead {
  phase: Phase = 'idle';
  direction: -1 | 1 = 1;
  private elapsed = 0;
  private queued?: { kind: 'up' | 'slam'; direction: -1 | 1 };
  private struck = new Set<string>();
  /** `clips`: chair-overhead.anims.json (up, slam, pogo). */
  constructor(private clips?: Clips) {}
  begin(kind: 'up' | 'slam', direction: -1 | 1) {
    if (this.phase === 'pogo' || this.phase === 'descend') { this.queued = { kind, direction }; return true; }
    if (this.phase !== 'idle') return false;
    this.direction = direction; this.struck.clear(); this.enter(kind === 'up' ? 'up' : 'windup'); return true;
  }
  private enter(phase: Phase) { this.phase = phase; this.elapsed = 0; }
  cancel() { this.enter('idle'); this.struck.clear(); this.queued = undefined; }
  step(dt: number) {
    this.elapsed += dt;
    const done = (clip: string, frames: number) => this.elapsed + 1e-9 >= clipTime(this.clips, clip, frames);
    // slam: 00–02 the windup, 03 the descent (held until the floor), 04–06 the landing
    if (this.phase === 'windup' && done('slam', 3)) this.enter('descend');
    else if (this.phase === 'up' && done('up', frameCount(this.clips, 'up', 6))
      || this.phase === 'land' && done('slam', 3)
      || this.phase === 'pogo' && done('pogo', frameCount(this.clips, 'pogo', 4))) {
      const queued = this.phase === 'pogo' ? this.queued : undefined; this.cancel();
      if (queued) this.begin(queued.kind, queued.direction);
    }
  }
  land(grounded: boolean) { if (grounded && this.phase === 'descend') this.enter('land'); }
  get pose() {
    if (this.phase === 'idle') return undefined;
    const clip = this.phase === 'up' ? 'up' : this.phase === 'pogo' ? 'pogo' : 'slam';
    const frame = frameAt(this.clips, clip, this.elapsed);
    const index = this.phase === 'descend' ? 3 : this.phase === 'land' ? Math.min(6, 4 + frame)
      : this.phase === 'windup' ? Math.min(2, frame) : Math.min(clip === 'up' ? 5 : 3, frame);
    return `${clip}-${String(index).padStart(2, '0')}`;
  }
  private rect(position: Position, left: number, right: number, y: number, h: number): Rect {
    return { x: position.x + (this.direction > 0 ? left : -right), y, w: right - left, h };
  }
  box(position: Position, previousY: number): Rect | undefined {
    const frame = frameAt(this.clips, 'up', this.elapsed);
    if (this.phase === 'up' && (frame === 2 || frame === 3)) {
      const c = UP_CONTACT; return this.rect(position, c.left, c.right, position.y - c.top, c.top - c.bottom);
    }
    if (this.phase === 'descend' && position.y >= previousY) {
      const c = SLAM_CONTACT;
      return this.rect(position, c.left, c.right, previousY - c.grain, position.y - previousY + c.grain * 2);
    }
    return undefined;
  }
  contact(position: Position, previousY: number, targets: Iterable<Damageable>) {
    const box = this.box(position, previousY), hits: Rect[] = [];
    if (!box) return { hits, bounce: undefined as number | undefined };
    const descending = this.phase === 'descend';
    const candidates = [...targets].filter(target => target.active?.() !== false)
      .map(target => ({ target, bounds: target.bounds() })).sort((a, b) => a.bounds.y - b.bounds.y);
    for (const { target, bounds } of candidates) {
      if (this.struck.has(target.id) || !intersects(box, bounds)
        || descending && bounds.y < previousY - SLAM_CONTACT.grain) continue;
      this.struck.add(target.id);
      if (target.hit({ damage: 1, direction: this.direction, position: { ...position }, kind: descending ? 'slam' : 'up' })) hits.push(bounds);
      if (descending) { this.enter('pogo'); return { hits, bounce: bounds.y }; }
    }
    return { hits, bounce: undefined as number | undefined };
  }
  hazard(position: Position, previousY: number, hazards: Rect[]) {
    const box = this.box(position, previousY);
    const hazard = this.phase === 'descend' && box && [...hazards].sort((a, b) => a.y - b.y)
      .find(target => target.y >= previousY - SLAM_CONTACT.grain && intersects(box, target));
    if (!hazard) return undefined;
    this.enter('pogo'); return hazard.y;
  }
}
