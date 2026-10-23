import { seeded } from '../anomalyLayout';
import { Voice } from './recipes';

/**
 * One ambient loop per region and one boss loop (docs/07), as bars of synthesized voices over a steady
 * noise bed. Bars are deterministic per index, so a loop sounds the same every time it plays.
 */

export type LoopId = 'hidden-garden' | 'rusty-creek' | 'boss-jenny';
export type LoopState = 'clean' | 'anomaly';

export interface Loop {
  /** Seconds per bar. */
  bar: number;
  /** A filtered noise bed that runs under the whole loop: wind, water. */
  bed?: { type: BiquadFilterType; freq: number; q?: number; gain: number };
  /** The voices of bar `index`; `start` is seconds into the bar. */
  voices(index: number): Voice[];
}

const chirp = (start: number, pitch: number): Voice =>
  ({ wave: 'sine', from: pitch, to: pitch * 1.6, start, dur: 0.09, gain: 0.05 });

export const LOOPS: Record<LoopId, Loop> = {
  // Wind in the garden, a soft pad and a few birds.
  'hidden-garden': {
    bar: 4,
    bed: { type: 'lowpass', freq: 900, gain: 0.05 },
    voices(index) {
      const rand = seeded(1000 + index);
      const birds = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => chirp(rand() * 3.6, 1900 + rand() * 900));
      const root = [196, 174.6, 220, 164.8][index % 4];
      return [
        { wave: 'sine', from: root, start: 0, dur: 4, attack: 1.2, gain: 0.05 },
        { wave: 'sine', from: root * 1.5, start: 0, dur: 4, attack: 1.6, gain: 0.03 },
        ...birds,
      ];
    },
  },
  // Running water, a low hum from the steel, now and then a girder ticking.
  'rusty-creek': {
    bar: 4,
    bed: { type: 'bandpass', freq: 700, q: 0.8, gain: 0.07 },
    voices(index) {
      const rand = seeded(2000 + index);
      const ticks: Voice[] = rand() < 0.5 ? [{
        wave: 'noise', start: rand() * 3.5, dur: 0.05, gain: 0.06, filter: { type: 'bandpass', from: 3000, q: 8 },
      }] : [];
      return [{ wave: 'triangle', from: 65.4, start: 0, dur: 4, attack: 1, gain: 0.08 }, ...ticks];
    },
  },
  // Jenny: 140 bpm, kick on 1 and 3, hats on the off-beats, a saw bass riff.
  'boss-jenny': {
    bar: (60 / 140) * 4,
    voices(index) {
      const beat = 60 / 140;
      const riff = index % 2 === 0 ? [55, 55, 65.4, 49] : [55, 55, 73.4, 61.7];
      const out: Voice[] = [];
      for (let b = 0; b < 4; b++) {
        if (b % 2 === 0) out.push({ wave: 'sine', from: 120, to: 40, start: b * beat, dur: 0.15, gain: 0.4 });
        out.push({ wave: 'noise', start: b * beat + beat / 2, dur: 0.04, gain: 0.07, filter: { type: 'highpass', from: 6000 } });
        out.push({ wave: 'sawtooth', from: riff[b], start: b * beat, dur: beat * 0.9, gain: 0.16, filter: { type: 'lowpass', from: 700 } });
      }
      return out;
    },
  },
};

/** The anomaly plays the same loop slightly flat – the place sounds wrong without changing tune. */
export const ANOMALY_DETUNE = 0.94;

export function loopVoices(id: LoopId, index: number, state: LoopState = 'clean'): Voice[] {
  const voices = LOOPS[id].voices(index);
  if (state === 'clean') return voices;
  return voices.map((v) => ({
    ...v,
    from: v.from && v.from * ANOMALY_DETUNE,
    to: v.to && v.to * ANOMALY_DETUNE,
  }));
}

/** Which ambient loop a region plays; regions without their own loop fall back to the creek. */
export function regionLoop(region: string): LoopId {
  return region === 'hidden-garden' ? 'hidden-garden' : 'rusty-creek';
}
