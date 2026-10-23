import { describe, expect, it } from 'vitest';
import { imageCut, pixelStretch, seeded, tornOutline } from './anomalyLayout';

const area = { x: 100, y: 50, w: 120, h: 80 };

describe('the anomaly language', () => {
  it('cuts the same rectangle and repeats it along the shift', () => {
    const slices = imageCut(area, 30, 3);
    expect(slices).toHaveLength(3);
    for (const s of slices) expect([s.sx, s.sy, s.sw, s.sh]).toEqual([100, 50, 120, 80]);
    expect(slices.map((s) => s.dx)).toEqual([130, 160, 190]);
    expect(slices.every((s) => s.dy === 50)).toBe(true);
  });

  it('stretches one row down the whole area and clamps the row inside it', () => {
    const { row, scaleY } = pixelStretch(area, 5);
    expect(row).toEqual({ sx: 100, sy: 55, sw: 120, sh: 1, dx: 100, dy: 50 });
    expect(scaleY).toBe(80);
    expect(pixelStretch(area, 999).row.sy).toBe(129);
    expect(pixelStretch(area, -4).row.sy).toBe(50);
  });

  it('tears the void edge the same way for the same seed, inside the rectangle', () => {
    const a = tornOutline(area, 404);
    expect(tornOutline(area, 404)).toEqual(a);
    expect(tornOutline(area, 405)).not.toEqual(a);
    for (const [x, y] of a) {
      expect(x).toBeGreaterThanOrEqual(area.x);
      expect(x).toBeLessThanOrEqual(area.x + area.w);
      expect(y).toBeGreaterThanOrEqual(area.y);
      expect(y).toBeLessThanOrEqual(area.y + area.h);
    }
  });

  it('draws numbers in [0, 1) from the seed', () => {
    const rand = seeded(1);
    for (let i = 0; i < 100; i++) {
      const n = rand();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
