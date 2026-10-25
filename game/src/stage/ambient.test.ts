import { describe, expect, it } from 'vitest';
import { flicker, landing } from './ambientModel';

describe('ambient: the rooms move', () => {
  it('drops a drip onto the first floor under it, else the room bottom', () => {
    const lines = [[[0, 342], [2020, 342]], [[0, 601], [2160, 607]]] as [number, number][][];
    expect(landing(lines, 300, 104, 1440)).toBe(342);
    expect(landing(lines, 300, 400, 1440)).toBeCloseTo(601.8, 0);
    expect(landing(lines, 2100, 104, 1440)).toBeCloseTo(606.8, 0);  // past the ledge's end
    expect(landing([], 300, 104, 1440)).toBe(1440);
  });
  it('keeps a lantern between 0.55 and 1, and moving', () => {
    const values = Array.from({ length: 600 }, (_, i) => flicker(i / 60, 0.4));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.55);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(new Set(values.map(v => v.toFixed(2))).size).toBeGreaterThan(5);
  });
});
