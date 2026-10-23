import { describe, expect, it } from 'vitest';
import { displayScale } from './viewport';

describe('canvas display scaling', () => {
  it('uses the largest whole multiplier that fits both dimensions', () => {
    expect(displayScale(3000, 1800)).toBe(2);
    expect(displayScale(1920, 1080)).toBe(1);
    expect(displayScale(2560, 1000)).toBe(1);
  });
  it('fits smaller windows without cropping the view', () => {
    expect(displayScale(640, 360)).toBe(0.5);
    expect(displayScale(320, 720)).toBe(0.25);
  });
});
