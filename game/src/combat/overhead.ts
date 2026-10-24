import { intersects, type Damageable, type Rect } from './sweeps';
import type { Position } from '../core/events';
import { RUN_SPEED } from '../player/movement';

// docs/02: measured chair-overhead legs; cell 108×126, foot pivot (54,126).
export const UP_CONTACT = { left: -3, right: 24, top: 114, bottom: 89 } as const;
export const SLAM_CONTACT = { left: 11, right: 37, grain: 2 } as const;
export const SLAM_SPEED = RUN_SPEED * 2; // Initial tuning in docs/02, 516 px/s.
type Phase = 'idle' | 'up' | 'windup' | 'descend' | 'land' | 'pogo';
export class Overhead {
  phase: Phase = 'idle';
  direction: -1 | 1 = 1;
  private elapsed = 0;
  private queued?: { kind: 'up' | 'slam'; direction: -1 | 1 };
  private struck = new Set<string>();
  begin(kind: 'up' | 'slam', direction: -1 | 1) {
    if (this.phase === 'pogo' || this.phase === 'descend') { this.queued = { kind, direction }; return true; }
    if (this.phase !== 'idle') return false;
    this.direction = direction; this.struck.clear(); this.enter(kind === 'up' ? 'up' : 'windup'); return true;
  }
  private enter(phase: Phase) { this.phase = phase; this.elapsed = 0; }
  cancel() { this.enter('idle'); this.struck.clear(); this.queued = undefined; }
  step(dt: number) {
    this.elapsed += dt;
    if (this.phase === 'windup' && this.elapsed + 1e-9 >= 3 / 12) this.enter('descend');
    else if (this.phase === 'up' && this.elapsed + 1e-9 >= 6 / 12
      || this.phase === 'land' && this.elapsed + 1e-9 >= 3 / 12
      || this.phase === 'pogo' && this.elapsed + 1e-9 >= 4 / 12) {
      const queued = this.phase === 'pogo' ? this.queued : undefined; this.cancel();
      if (queued) this.begin(queued.kind, queued.direction);
    }
  }
  land(grounded: boolean) { if (grounded && this.phase === 'descend') this.enter('land'); }
  get pose() {
    if (this.phase === 'idle') return undefined;
    const frame = Math.floor((this.elapsed + 1e-9) * 12);
    const clip = this.phase === 'up' ? 'up' : this.phase === 'pogo' ? 'pogo' : 'slam';
    const index = this.phase === 'descend' ? 3 : this.phase === 'land' ? Math.min(6, 4 + frame)
      : this.phase === 'windup' ? Math.min(2, frame) : Math.min(clip === 'up' ? 5 : 3, frame);
    return `${clip}-${String(index).padStart(2, '0')}`;
  }
  private rect(position: Position, left: number, right: number, y: number, h: number): Rect {
    return { x: position.x + (this.direction > 0 ? left : -right), y, w: right - left, h };
  }
  box(position: Position, previousY: number): Rect | undefined {
    const frame = Math.floor((this.elapsed + 1e-9) * 12);
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
