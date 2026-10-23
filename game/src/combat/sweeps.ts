export interface Rect { x: number; y: number; w: number; h: number }
export interface ChairHit { damage: number; direction: -1 | 1; position: { x: number; y: number }; kind: 'sweep' }
export interface Damageable { id: string; bounds(): Rect; hit(hit: ChairHit): boolean }
export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class HitStop {
  remaining = 0;
  trigger() { this.remaining = 60; }
  consume(milliseconds: number) {
    const paused = Math.min(this.remaining, milliseconds);
    this.remaining -= paused;
    return milliseconds - paused;
  }
}

/** Contact poses inspected in the approved atlas: A=04, B=03. */
export class Sweeps {
  phase: 'idle' | 'sweep-a' | 'sweep-b' | 'recoil' = 'idle';
  frame = 0;
  direction: -1 | 1 = 1;
  private nextB = false;
  private elapsed = 0;
  private queued: -1 | 1 | null = null;
  private struck = new Set<string>();
  private begin(direction: -1 | 1) {
    this.phase = this.nextB ? 'sweep-b' : 'sweep-a'; this.nextB = !this.nextB;
    this.direction = direction; this.frame = 0; this.elapsed = 0; this.struck.clear();
  }
  press(direction: -1 | 1) {
    if (this.phase === 'idle') this.begin(direction);
    else this.queued = direction;
  }
  cancel() { this.phase = 'idle'; this.frame = 0; this.elapsed = 0; this.queued = null; this.struck.clear(); }
  step(dt: number) {
    if (this.phase === 'idle') return;
    this.elapsed += dt;
    while (this.elapsed + 1e-9 >= 1 / 12 && this.phase !== 'idle') {
      this.elapsed = Math.max(0, this.elapsed - 1 / 12); this.frame++;
      if (this.frame < (this.phase === 'recoil' ? 2 : 8)) continue;
      if (this.phase !== 'recoil') { this.phase = 'recoil'; this.frame = 0; }
      else {
        this.phase = 'idle'; this.frame = 0;
        if (this.queued !== null) { const direction = this.queued; this.queued = null; this.begin(direction); }
      }
    }
  }
  box(position: { x: number; y: number }): Rect | null {
    const contact = this.phase === 'sweep-a' && this.frame === 4 || this.phase === 'sweep-b' && this.frame === 3;
    return contact ? { x: position.x + (this.direction > 0 ? 8 : -50), y: position.y - 52, w: 42, h: 44 } : null;
  }
  hit(position: { x: number; y: number }, targets: Iterable<Damageable>) {
    const box = this.box(position), hits: Rect[] = [];
    if (!box) return hits;
    for (const target of targets) {
      const bounds = target.bounds();
      if (this.struck.has(target.id) || !intersects(box, bounds)) continue;
      this.struck.add(target.id);
      if (target.hit({ damage: 1, direction: this.direction, position: { ...position }, kind: 'sweep' })) hits.push(bounds);
    }
    return hits;
  }
}
