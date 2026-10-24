/**
 * Dexter at the coffee machine (docs/03 "Region 1 story beats", #52). He sits there before you arrive. The
 * first save at his machine: he bows, sweats – sorry – and hands over the pocket computer and a muffin. Every
 * save after that: he absorbs the black-fluid pools left by your fights, one after another, while you watch.
 * No words. Pure state; the CoffeeVisit scene draws it.
 */
export type VisitPhase = 'waiting' | 'bow' | 'sweat' | 'give' | 'absorb' | 'idle';

/** Milliseconds per phase; `absorb` repeats once per pool. */
export const VISIT_TIMING = { bow: 700, sweat: 1000, give: 1100, absorb: 900 } as const;
/** How far a Dexter spawn may be from a coffee machine to belong to it (stage px). */
export const MACHINE_REACH = 160;

type Timed = keyof typeof VISIT_TIMING;
const timed = (phase: VisitPhase): phase is Timed => phase in VISIT_TIMING;

export class VisitSequence {
  phase: VisitPhase = 'waiting';
  /** Pools waiting to be absorbed, oldest first. */
  readonly pools: number[] = [];
  private gifted = false;
  private elapsed = 0;

  /** `onGift` runs once, when the gifts leave his paws; `onAbsorb` once per pool, with its id. */
  constructor(private hooks: { onGift?: () => void; onAbsorb?: (pool: number) => void } = {}) {}

  addPool(id: number): void { this.pools.push(id); }

  /** The hero saved at this machine. Ignored while he is busy. */
  arrive(): void {
    if (timed(this.phase)) return;
    if (!this.gifted) this.enter('bow');
    else this.enter(this.pools.length ? 'absorb' : 'idle');
  }

  update(milliseconds: number): VisitPhase {
    if (!timed(this.phase)) return this.phase;
    this.elapsed += milliseconds;
    while (timed(this.phase) && this.elapsed >= VISIT_TIMING[this.phase]) {
      this.elapsed -= VISIT_TIMING[this.phase];
      this.leave(this.phase);
    }
    return this.phase;
  }

  /** 0 → 1 through the current timed phase. */
  progress(): number {
    return timed(this.phase) ? Math.min(1, this.elapsed / VISIT_TIMING[this.phase]) : 0;
  }

  private leave(phase: Timed): void {
    if (phase === 'bow') return this.enter('sweat');
    if (phase === 'sweat') return this.enter('give');
    if (phase === 'give') {
      this.gifted = true;
      this.hooks.onGift?.();
    } else {
      const pool = this.pools.shift();
      if (pool !== undefined) this.hooks.onAbsorb?.(pool);
    }
    // Absorb repeats while pools are left; with none it is skipped.
    this.enter(this.pools.length ? 'absorb' : 'idle');
  }

  private enter(phase: Exclude<VisitPhase, 'waiting'>): void {
    this.phase = phase;
    if (!timed(phase)) this.elapsed = 0;
  }
}

/** The Dexter spawn that belongs to a machine: the nearest one within reach of its foot, or none. */
export function dexterFor<T extends { x: number; y: number }>(machine: { x: number; y: number; w: number; h: number },
  spawns: T[]): T | undefined {
  const cx = machine.x + machine.w / 2;
  const foot = machine.y + machine.h;
  return spawns
    .map(s => ({ s, d: Math.hypot(s.x - cx, s.y - foot) }))
    .filter(({ d }) => d <= MACHINE_REACH)
    .sort((a, b) => a.d - b.d)[0]?.s;
}
