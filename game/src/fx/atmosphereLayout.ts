/** Numbers for the atmosphere layers (docs/04: layers 4, 7, 8), kept pure so they are tested without Phaser. */

export type StageState = 'clean' | 'anomaly';

/**
 * The first row where the water layer is mostly opaque: the reflection starts there.
 * `alphaAt(x, y)` reads the layer's alpha (0–255); rows and columns are sampled every `step` px.
 */
export function findWaterline(width: number, height: number, alphaAt: (x: number, y: number) => number, step = 4, cover = 0.5): number {
  for (let y = 0; y < height; y += step) {
    let solid = 0;
    let samples = 0;
    for (let x = 0; x < width; x += step * 4) {
      samples++;
      if (alphaAt(x, y) > 128) solid++;
    }
    if (solid / samples >= cover) {
      // Walk back up to the exact first solid row.
      while (y > 0 && rowCover(width, y - 1, alphaAt, step * 4) >= cover) y--;
      return y;
    }
  }
  return height;
}

function rowCover(width: number, y: number, alphaAt: (x: number, y: number) => number, stride: number): number {
  let solid = 0;
  let samples = 0;
  for (let x = 0; x < width; x += stride) {
    samples++;
    if (alphaAt(x, y) > 128) solid++;
  }
  return solid / samples;
}

/** Where a vertically flipped copy of a layer `height` px tall goes so it mirrors about `waterline`. */
export function mirroredTop(waterline: number, height: number): number {
  return 2 * waterline - height;
}

/** Ripple: each horizontal strip of the reflection sways sideways a few whole pixels, out of phase with its neighbours. */
export function rippleOffset(strip: number, timeMs: number, amplitude = 2): number {
  return Math.round(amplitude * Math.sin(timeMs / 420 + strip * 0.7));
}

/** Leaves fall and drift left in the clean state; in the anomaly state they drift upward (#36). */
export function leafDrift(state: StageState): { speedX: [number, number]; speedY: [number, number] } {
  return state === 'clean'
    ? { speedX: [-60, -20], speedY: [25, 55] }
    : { speedX: [-40, 10], speedY: [-55, -25] };
}
