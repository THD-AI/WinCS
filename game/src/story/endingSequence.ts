/**
 * The end of the slice (docs/03 "The ending sequence", #58, #160): Jenny leaks, Dexter hops in and absorbs the
 * fluid, grows, hops ahead, stops and looks back at the hero once – the garden's first look, now from a grown
 * Dexter – and hops off; the frame glitches, the "to be continued" window waits for OK, the credits
 * roll and the game returns to the title. Pure timing, so it is tested without Phaser.
 */
export type EndingPhase = 'idle' | 'leak' | 'appear' | 'absorb' | 'grow' | 'leave' | 'look' | 'exit' | 'glitch' | 'dialog' | 'credits' | 'done';

const TIMED = ['leak', 'appear', 'absorb', 'grow', 'leave', 'look', 'exit', 'glitch'] as const;

/** Milliseconds per phase; the frame counts of the fx and dexter atlases at 12 fps set the first three. */
export const TIMING = {
  leak: 900,      // fx black-fluid, 6 frames, then the pool sits
  appear: 700,    // dexter hop, 4 frames, plus the landing
  absorb: 1200,   // dexter-acts absorb, 4 frames, while the pool drains
  grow: 900,
  leave: 800,     // hops ahead and stops, still in view
  look: 1400,     // dexter-prologue look-back: the one held moment
  exit: 500,      // hops off the right edge
  glitch: 900,
  dialogGuard: 300,
  creditsGuard: 1500,
} as const;

/** docs/04 scale: the 27 px plush grows a quarter of the way to the 101 px mascot per region boss. */
export const DEXTER_PX = { plush: 27, final: 101, regionBosses: 4 } as const;
export const DEXTER_AFTER_JENNY_PX = Math.round(DEXTER_PX.plush + (DEXTER_PX.final - DEXTER_PX.plush) / DEXTER_PX.regionBosses);

export class EndingSequence {
  phase: EndingPhase = 'idle';
  private elapsed = 0;

  constructor(private readonly onDone: () => void = () => {}) {}

  start(): void { if (this.phase === 'idle') this.enter('leak'); }

  /** Advance by dt milliseconds; returns the phase after the step. */
  update(dt: number): EndingPhase {
    this.elapsed += dt;
    const i = TIMED.indexOf(this.phase as (typeof TIMED)[number]);
    if (i >= 0 && this.elapsed >= TIMING[TIMED[i]]) this.enter(TIMED[i + 1] ?? 'dialog');
    return this.phase;
  }

  /** 0 → 1 through the current phase (1 once a timed phase is over or the phase is untimed). */
  progress(): number {
    const timed = TIMED.includes(this.phase as (typeof TIMED)[number]);
    return timed ? Math.min(1, this.elapsed / TIMING[this.phase as (typeof TIMED)[number]]) : 1;
  }

  /** OK on the window, then any confirm after the credits have been up a moment. */
  confirm(): boolean {
    if (this.phase === 'dialog' && this.elapsed >= TIMING.dialogGuard) return this.enter('credits'), true;
    if (this.phase === 'credits' && this.elapsed >= TIMING.creditsGuard) {
      this.enter('done');
      this.onDone();
      return true;
    }
    return false;
  }

  private enter(phase: EndingPhase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}

/** Dexter's scale through the sequence: the plush until he absorbs, then eased up to the post-Jenny size. */
export function dexterScale(phase: EndingPhase, progress: number): number {
  const grown = DEXTER_AFTER_JENNY_PX / DEXTER_PX.plush;
  if (phase === 'grow') return 1 + (grown - 1) * (1 - (1 - progress) ** 3);
  return phase === 'leave' || phase === 'look' || phase === 'exit' || phase === 'glitch' ? grown : 1;
}
