/**
 * The crossing (docs/02 "crossing is cheap", the anomaly-language frame): the hero is hit, the picture
 * freezes and cracks, Windows says "THD.exe has stopped responding." – OK – cut – the hero lands somewhere
 * else and the damage animation finishes there. One sequence, reused by the pond (M3) and Jenny's ram (M4).
 */
export type CrossingPhase = 'idle' | 'hit' | 'freeze' | 'dialog' | 'cut' | 'land' | 'done';

export const TIMING = { hit: 280, freeze: 220, dialogGuard: 300, cut: 200 } as const;

export class CrossingSequence {
  phase: CrossingPhase = 'idle';
  private elapsed = 0;

  constructor(private readonly onLand: () => void = () => {}) {}

  start(): void { this.enter('hit'); }

  /** Advance by dt milliseconds; returns the phase after the step. */
  update(dt: number): CrossingPhase {
    this.elapsed += dt;
    if (this.phase === 'hit' && this.elapsed >= TIMING.hit) this.enter('freeze');
    else if (this.phase === 'freeze' && this.elapsed >= TIMING.freeze) this.enter('dialog');
    else if (this.phase === 'cut' && this.elapsed >= TIMING.cut) {
      this.enter('land');
      this.onLand();
      this.enter('done');
    }
    return this.phase;
  }

  /** The player pressed OK. Ignored until the dialog has been up long enough to be read. */
  confirm(): boolean {
    if (this.phase !== 'dialog' || this.elapsed < TIMING.dialogGuard) return false;
    this.enter('cut');
    return true;
  }

  private enter(phase: CrossingPhase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}
