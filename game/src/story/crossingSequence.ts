/**
 * The crossing (docs/02 "crossing is cheap", the anomaly-language frame): the hero is hit, the picture
 * freezes and cracks, Windows says "THD.exe has stopped responding." – OK – cut – the hero lands somewhere
 * else and the damage animation finishes there. One sequence, reused by the pond (M3) and Jenny's ram (M4).
 */
export type CrossingPhase = 'idle' | 'hit' | 'freeze' | 'dialog' | 'pull' | 'cut' | 'land' | 'done';

export interface CrossingTiming { hit: number; freeze: number; dialogGuard: number; pull: number; cut: number }

/** The classic crossing: no pull, OK cuts straight to black. */
export const TIMING: CrossingTiming = { hit: 280, freeze: 220, dialogGuard: 300, pull: 0, cut: 200 };

/**
 * The prologue's 404 (docs/03 "the 404" → "the pull"): a short flash, the frame tears for longer, and after
 * OK the hero is pulled into the 404 void before the cut.
 */
export const TIMING_404: CrossingTiming = { hit: 160, freeze: 1100, dialogGuard: 450, pull: 1700, cut: 450 };

export interface Area { x: number; y: number; w: number; h: number }

/** Where the 404 tears the frame, around the hero's view position: the void opens in the water just past him. */
export function tearLayout(hero: { x: number; y: number }, view: { w: number; h: number }): {
  void: Area; cuts: { area: Area; shift: number; copies: number }[]; stretch: Area;
} {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const vw = 220;
  const vh = 140;
  const voidArea = { x: clamp(hero.x + 30 - vw / 2, 16, view.w - vw - 16), y: clamp(hero.y - 20, 16, view.h - vh - 16), w: vw, h: vh };
  const band = (y: number, h: number) => ({ x: 0, y: clamp(Math.round(y), 0, view.h - h), w: view.w, h });
  const sx = clamp(hero.x - 260, 0, view.w - 140);
  return {
    void: voidArea,
    cuts: [
      { area: band(hero.y - 96, 46), shift: 56, copies: 2 },
      { area: band(hero.y + 150, 30), shift: -72, copies: 3 },
      { area: band(hero.y - 230, 22), shift: 34, copies: 2 },
    ],
    stretch: { x: sx, y: clamp(hero.y - 300, 0, view.h - 60), w: 140, h: clamp(260, 60, view.h - clamp(hero.y - 300, 0, view.h - 60)) },
  };
}

export class CrossingSequence {
  phase: CrossingPhase = 'idle';
  private elapsed = 0;

  constructor(private readonly onLand: () => void = () => {}, readonly timing: CrossingTiming = TIMING) {}

  start(): void { this.enter('hit'); }

  /** Advance by dt milliseconds; returns the phase after the step. */
  update(dt: number): CrossingPhase {
    this.elapsed += dt;
    const timing = this.timing;
    if (this.phase === 'hit' && this.elapsed >= timing.hit) this.enter('freeze');
    else if (this.phase === 'freeze' && this.elapsed >= timing.freeze) this.enter('dialog');
    else if (this.phase === 'pull' && this.elapsed >= timing.pull) this.enter('cut');
    else if (this.phase === 'cut' && this.elapsed >= timing.cut) {
      this.enter('land');
      this.onLand();
      this.enter('done');
    }
    return this.phase;
  }

  /** The player pressed OK. Ignored until the dialog has been up long enough to be read. */
  confirm(): boolean {
    if (this.phase !== 'dialog' || this.elapsed < this.timing.dialogGuard) return false;
    this.enter(this.timing.pull > 0 ? 'pull' : 'cut');
    return true;
  }

  /** 0 → 1 through the pull (1 outside it). */
  pullProgress(): number {
    return this.phase === 'pull' && this.timing.pull > 0 ? Math.min(1, this.elapsed / this.timing.pull) : 1;
  }

  /** Milliseconds spent in the current phase. */
  get time(): number { return this.elapsed; }

  private enter(phase: CrossingPhase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}
