/**
 * Every sound in the slice, synthesized: no audio files (decision 14, docs/07). A recipe is a few voices –
 * an oscillator or noise with a pitch glide, an envelope and an optional filter sweep – kept as plain data
 * so the list and the loudness are tested without Web Audio.
 */

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface Voice {
  wave: Wave;
  /** Pitch glide in Hz (ignored for noise). */
  from?: number;
  to?: number;
  /** Seconds after the sound starts. */
  start?: number;
  dur: number;
  /** Attack in seconds; the rest of `dur` decays to silence. */
  attack?: number;
  /** Peak gain, 0–1. */
  gain: number;
  filter?: { type: BiquadFilterType; from: number; to?: number; q?: number };
}

export type SoundId =
  | 'footstep-girder' | 'footstep-grass'
  | 'chair-whoosh' | 'chair-hit'
  | 'rover-motor' | 'crab-servo' | 'drone-hum'
  | 'jenny-engine' | 'jenny-crash'
  | 'fluid-absorb' | 'crash-ding'
  | 'player-hurt' | 'enemy-defeated';

export const RECIPES: Record<SoundId, Voice[]> = {
  'footstep-girder': [
    { wave: 'noise', dur: 0.06, gain: 0.45, filter: { type: 'bandpass', from: 2600, q: 3 } },
    { wave: 'square', from: 180, to: 120, dur: 0.04, gain: 0.08 },
  ],
  'footstep-grass': [
    { wave: 'noise', dur: 0.09, attack: 0.01, gain: 0.16, filter: { type: 'highpass', from: 3200, to: 1600 } },
  ],
  'chair-whoosh': [
    { wave: 'noise', dur: 0.22, attack: 0.08, gain: 0.7, filter: { type: 'bandpass', from: 600, to: 2400, q: 1 } },
  ],
  'chair-hit': [
    { wave: 'square', from: 220, to: 60, dur: 0.12, gain: 0.3 },
    { wave: 'noise', dur: 0.08, gain: 0.3, filter: { type: 'lowpass', from: 1400, to: 400 } },
  ],
  'rover-motor': [
    { wave: 'sawtooth', from: 70, to: 92, dur: 0.5, attack: 0.05, gain: 0.18, filter: { type: 'lowpass', from: 420 } },
  ],
  'crab-servo': [
    { wave: 'square', from: 420, to: 900, dur: 0.12, gain: 0.3, filter: { type: 'bandpass', from: 1200, q: 1.5 } },
    { wave: 'square', from: 900, to: 520, start: 0.13, dur: 0.1, gain: 0.3, filter: { type: 'bandpass', from: 1200, q: 1.5 } },
  ],
  'drone-hum': [
    { wave: 'sine', from: 220, dur: 0.8, attack: 0.15, gain: 0.12 },
    { wave: 'sine', from: 223, dur: 0.8, attack: 0.15, gain: 0.12 },
  ],
  'jenny-engine': [
    { wave: 'sawtooth', from: 55, to: 140, dur: 0.9, attack: 0.05, gain: 0.3, filter: { type: 'lowpass', from: 300, to: 1200 } },
  ],
  'jenny-crash': [
    { wave: 'noise', dur: 1.2, gain: 0.5, filter: { type: 'lowpass', from: 3000, to: 200 } },
    { wave: 'square', from: 90, to: 30, dur: 0.4, gain: 0.3 },
  ],
  'fluid-absorb': [
    { wave: 'sine', from: 320, to: 80, dur: 0.6, attack: 0.05, gain: 0.3 },
    { wave: 'noise', dur: 0.5, attack: 0.1, gain: 0.12, filter: { type: 'lowpass', from: 500, to: 200 } },
  ],
  // The old desktop's error chime: two soft bells a beat apart.
  'crash-ding': [
    { wave: 'sine', from: 880, dur: 0.9, gain: 0.22 },
    { wave: 'sine', from: 1318.5, start: 0.07, dur: 0.8, gain: 0.18 },
    { wave: 'triangle', from: 1760, dur: 0.25, gain: 0.05 },
  ],
  'player-hurt': [
    { wave: 'square', from: 300, to: 120, dur: 0.15, gain: 0.25 },
  ],
  'enemy-defeated': [
    { wave: 'square', from: 600, to: 150, dur: 0.18, gain: 0.2 },
    { wave: 'noise', dur: 0.1, gain: 0.18, filter: { type: 'lowpass', from: 2000 } },
  ],
};

/** The loudest a recipe can get: every voice's peak at once. Kept under 0.9 so nothing clips. */
export function peakGain(voices: Voice[]): number {
  return voices.reduce((sum, v) => sum + v.gain, 0);
}

/** How long a recipe rings, in seconds. */
export function length(voices: Voice[]): number {
  return Math.max(...voices.map((v) => (v.start ?? 0) + v.dur));
}
