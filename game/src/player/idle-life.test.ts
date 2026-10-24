import { describe, expect, it } from 'vitest';
import { BREATH_ROW, HEM_ROW, PonchoSway, sliceRows, SWAY_HOLD, windPush } from './idle-life';
import { DEFAULT_ATMOSPHERE } from '../stage/atmosphere/config';

const wind = DEFAULT_ATMOSPHERE.wind;

describe('idle life', () => {
  it('slices the frame into chest, poncho and legs, the chest one row taller on the in-breath, the cover off the legs', () => {
    expect(sliceRows(0, 0)).toEqual({ chest: [0, BREATH_ROW], poncho: [BREATH_ROW, HEM_ROW - BREATH_ROW], legs: [HEM_ROW, 80 - HEM_ROW] });
    expect(sliceRows(1, 2).chest).toEqual([0, BREATH_ROW + 1]); // drawn 1 px up: the split row shows twice
    expect(sliceRows(1, 2).legs).toEqual([HEM_ROW, 80 - HEM_ROW - 2]);
  });
  it('sways the poncho 1 px downwind only while a gust passes, held, and never while moving', () => {
    const sway = new PonchoSway();
    const offsets: number[] = [];
    for (let t = 0; t < 30; t += 1 / 60) offsets.push(sway.update(wind, 900, t, 1 / 60, true));
    expect(new Set(offsets)).toEqual(new Set([0, wind.direction])); // only downwind, only 1 px
    const changes = offsets.flatMap((o, i) => i && o !== offsets[i - 1] ? [i] : []);
    expect(changes.length).toBeGreaterThan(1); // gusts come and go over 30 s
    for (let i = 1; i < changes.length; i++) expect((changes[i] - changes[i - 1]) / 60).toBeGreaterThanOrEqual(SWAY_HOLD - 1e-6);
    expect(sway.update(wind, 900, 31, 1 / 60, false)).toBe(0);
    expect(sway.update(null, 900, 31, 1 / 60, true)).toBe(0);
  });
  it('reads the same wind the foliage shows: the push follows the gust fronts downwind', () => {
    const calm = { ...wind, gust: 0 };
    for (let t = 0; t < 10; t += 0.1) expect(Math.abs(windPush(calm, 500, t))).toBeLessThanOrEqual(wind.base + 1e-9);
    let strongest = 0;
    for (let t = 0; t < 10; t += 0.05) strongest = Math.min(strongest, windPush(wind, 500, t));
    expect(strongest).toBeLessThan(-0.6); // direction −1: gusts push left past the threshold
  });
});
