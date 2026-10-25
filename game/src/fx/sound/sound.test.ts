import { describe, expect, it } from 'vitest';
import manifest from '../../../../docs/07-ASSET-MANIFEST.md?raw';
import { LOOPS, loopVoices, regionLoop, ANOMALY_DETUNE } from './loops';
import { length, peakGain, RECIPES, SoundId } from './recipes';

/** docs/07's audio list, mapped to the recipes that cover it. */
const MANIFEST: [string, SoundId[]][] = [
  ['Footsteps (girder, grass)', ['footstep-girder', 'footstep-grass']],
  ['chair whoosh + hit', ['chair-whoosh', 'chair-hit']],
  ['rover motor', ['rover-motor']],
  ['crab servos', ['crab-servo']],
  ['drone hum', ['drone-hum']],
  ['Jenny engine + crash', ['jenny-engine', 'jenny-crash']],
  ['fluid absorb', ['fluid-absorb']],
  ['ding', ['crash-ding']],
  ['rubber squeak', ['rubber-squeak']],
];

describe('synthesized sound', () => {
  it('covers every effect docs/07 lists', () => {
    for (const [phrase, ids] of MANIFEST) {
      expect(manifest).toContain(phrase);
      for (const id of ids) expect(RECIPES[id]).toBeDefined();
    }
  });

  it('keeps every effect short and under the clipping limit', () => {
    for (const [id, voices] of Object.entries(RECIPES)) {
      expect(peakGain(voices), id).toBeLessThanOrEqual(0.9);
      expect(length(voices), id).toBeLessThanOrEqual(1.5);
    }
  });

  it('keeps every bar of every loop inside its bar and under the limit', () => {
    for (const [id, loop] of Object.entries(LOOPS)) {
      for (let bar = 0; bar < 8; bar++) {
        const voices = loop.voices(bar);
        for (const v of voices) expect((v.start ?? 0) + v.dur, id).toBeLessThanOrEqual(loop.bar + 1e-9);
        // Voices that overlap in time: at worst all of them at once, plus the bed.
        expect(peakGain(voices.filter((v) => (v.start ?? 0) === 0)) + (loop.bed?.gain ?? 0), id).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it('plays the same bar the same way every time', () => {
    expect(LOOPS['hidden-garden'].voices(3)).toEqual(LOOPS['hidden-garden'].voices(3));
  });

  it('detunes the loop in the anomaly state', () => {
    const clean = loopVoices('rusty-creek', 0, 'clean')[0];
    const wrong = loopVoices('rusty-creek', 0, 'anomaly')[0];
    expect(wrong.from).toBeCloseTo((clean.from ?? 0) * ANOMALY_DETUNE);
  });

  it('gives each slice region an ambient loop', () => {
    expect(regionLoop('hidden-garden')).toBe('hidden-garden');
    expect(regionLoop('rusty-creek')).toBe('rusty-creek');
  });
});
