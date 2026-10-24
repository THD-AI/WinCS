/**
 * The pond finale (docs/03 prologue, beats "something wrong" → "the shove", #50 #51): the hero reaches the
 * jetty edge with Dexter at the jetty; control is taken, the reflection goes wrong while Dexter points at it,
 * he steps up behind the hero and shoves – the hero is knocked out over the water, and the 404 crossing takes
 * over (Crossing, variant '404'). Pure timing, tested without Phaser.
 */
export type FinalePhase = 'idle' | 'reveal' | 'step' | 'shove' | 'fall' | 'crash';

const TIMED = ['reveal', 'step', 'shove', 'fall'] as const;

/** Milliseconds per phase; the shove clip is dexter `shove`, 4 frames at 12 fps, plus a held beat. */
export const FINALE = {
  reveal: 2200,
  step: 650,
  shove: 480,
  fall: 420,
  /** The shove clip frame on which his paws connect and the hero is knocked away. */
  contactFrame: 2,
  /** How far the knock carries the hero out over the water (px) and how high it lifts him. */
  knockX: 64,
  knockLift: 34,
  /** Dexter stands this far behind the hero to shove (px). */
  behind: 20,
} as const;

export class FinaleSequence {
  phase: FinalePhase = 'idle';
  private elapsed = 0;

  constructor(private readonly onCrash: () => void = () => {}) {}

  start(): boolean {
    if (this.phase !== 'idle') return false;
    this.enter('reveal');
    return true;
  }

  update(dt: number): FinalePhase {
    this.elapsed += dt;
    const i = TIMED.indexOf(this.phase as (typeof TIMED)[number]);
    if (i >= 0 && this.elapsed >= FINALE[TIMED[i]]) {
      const next = TIMED[i + 1] ?? 'crash';
      this.enter(next);
      if (next === 'crash') this.onCrash();
    }
    return this.phase;
  }

  /** 0 → 1 through the current timed phase. */
  progress(): number {
    const i = TIMED.indexOf(this.phase as (typeof TIMED)[number]);
    return i >= 0 ? Math.min(1, this.elapsed / FINALE[TIMED[i]]) : 1;
  }

  private enter(phase: FinalePhase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}

/** Where the knocked hero is `t` (0 → 1) through the fall: out over the water on an arc. */
export function knockArc(from: { x: number; y: number }, t: number): { x: number; y: number; angle: number } {
  const e = Math.min(1, Math.max(0, t));
  return {
    x: from.x + FINALE.knockX * e,
    y: from.y - FINALE.knockLift * 4 * e * (1 - e) + 10 * e * e,
    angle: 40 * e,
  };
}

/** The pull into the void after OK: eased in, so it starts slow and swallows fast. */
export function pullCurve(t: number): { scale: number; spin: number; reach: number } {
  const e = Math.min(1, Math.max(0, t)) ** 2.2;
  return { scale: 1 - e, spin: e * Math.PI * 5, reach: e };
}
