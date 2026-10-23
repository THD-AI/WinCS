import { describe, expect, it } from 'vitest';
import { findWaterline, leafDrift, mirroredTop, rippleOffset } from './atmosphereLayout';

describe('the atmosphere layers', () => {
  it('finds the first mostly-opaque row of the water layer, ignoring stray pixels above it', () => {
    const alphaAt = (x: number, y: number) => (y >= 597 || (y === 100 && x === 0) ? 255 : 0);
    expect(findWaterline(2160, 720, alphaAt)).toBe(597);
    expect(findWaterline(100, 50, () => 0)).toBe(50);
  });

  it('mirrors a layer about the waterline', () => {
    // A 720 px layer flipped and placed here maps row r to 2·596 − 1 − r.
    const top = mirroredTop(596, 720);
    expect(top).toBe(472);
    const row = 100;
    expect(top + (720 - 1 - row)).toBe(2 * 596 - 1 - row);
  });

  it('ripples by whole pixels within the amplitude, and neighbouring strips differ', () => {
    for (let t = 0; t < 5000; t += 37) {
      const o = rippleOffset(3, t, 2);
      expect(Number.isInteger(o)).toBe(true);
      expect(Math.abs(o)).toBeLessThanOrEqual(2);
    }
    expect([0, 1, 2, 3].map((i) => rippleOffset(i, 0, 2))).not.toEqual([0, 0, 0, 0]);
  });

  it('lets leaves fall in the clean state and rise in the anomaly state', () => {
    expect(Math.min(...leafDrift('clean').speedY)).toBeGreaterThan(0);
    expect(Math.max(...leafDrift('anomaly').speedY)).toBeLessThan(0);
  });
});
