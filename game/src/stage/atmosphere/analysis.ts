import type Phaser from 'phaser';
/**
 * What the atmosphere reads from the art itself, once per layer at load – pure, so it is tested without
 * Phaser: where each column of a layer is anchored (its ground), the waterline, the autumn palette.
 */

/** Alpha / colour access to a (possibly downscaled) copy of a layer: rgba bytes, row-major. */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray | Uint8Array; scale: number }

/** Column buckets in a layer's anchor profile (the shader interpolates between them). */
export const PROFILE_SIZE = 48;
const SOLID = 128;

const alpha = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

/**
 * For each of PROFILE_SIZE column buckets, the row (in full-size layer px) a plant in it is rooted at.
 * 'base': the lowest opaque row (trees and foreground plants grow up from it);
 * 'top': the highest opaque row (grass on a walkable surface). Empty buckets copy their neighbours;
 * the result is smoothed (1-2-1) so the sway field has no seams.
 */
export function anchorProfile(p: Pixels, anchor: 'base' | 'top', out: Float32Array = new Float32Array(PROFILE_SIZE)): Float32Array {
  const raw = new Float32Array(PROFILE_SIZE).fill(NaN);
  for (let b = 0; b < PROFILE_SIZE; b++) {
    const x0 = Math.floor((b * p.width) / PROFILE_SIZE), x1 = Math.max(x0 + 1, Math.floor(((b + 1) * p.width) / PROFILE_SIZE));
    let best = NaN;
    for (let x = x0; x < x1; x++) {
      if (anchor === 'base') {
        for (let y = p.height - 1; y >= 0; y--) if (alpha(p, x, y) >= SOLID) { if (!(best >= y)) best = y; break; }
      } else {
        for (let y = 0; y < p.height; y++) if (alpha(p, x, y) >= SOLID) { if (!(best <= y)) best = y; break; }
      }
    }
    raw[b] = best;
  }
  // Fill empty buckets from the nearest filled one; a fully empty layer anchors at its bottom.
  for (let b = 0; b < PROFILE_SIZE; b++) {
    if (!Number.isNaN(raw[b])) continue;
    let value = NaN;
    for (let d = 1; d < PROFILE_SIZE && Number.isNaN(value); d++) {
      if (b - d >= 0 && !Number.isNaN(raw[b - d])) value = raw[b - d];
      else if (b + d < PROFILE_SIZE && !Number.isNaN(raw[b + d])) value = raw[b + d];
    }
    raw[b] = Number.isNaN(value) ? p.height - 1 : value;
  }
  for (let b = 0; b < PROFILE_SIZE; b++) {
    const l = raw[Math.max(0, b - 1)], r = raw[Math.min(PROFILE_SIZE - 1, b + 1)];
    out[b] = ((l + 2 * raw[b] + r) / 4 + 0.5) * p.scale;
  }
  return out;
}

/**
 * The waterline of a water layer in full-size px: the first row that is mostly water, ignoring stray
 * specks above it (a row counts when at least `cover` of it is opaque). -1 when the layer has no water.
 */
export function waterline(p: Pixels, cover = 0.5): number {
  for (let y = 0; y < p.height; y++) {
    let solid = 0;
    for (let x = 0; x < p.width; x++) if (alpha(p, x, y) >= SOLID) solid++;
    if (solid / p.width >= cover) return y * p.scale;
  }
  return -1;
}

/**
 * Autumn colours from the art: saturated orange, red and yellow pixels, bucketed and ranked by how
 * often they occur; up to `count` distinct ones (at least `distance` apart in RGB), most common first.
 */
export function autumnPalette(p: Pixels, count = 6, distance = 48): number[] {
  const histogram = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] < 250) continue;
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 90 || (max - min) / max < 0.5 || max !== r) continue; // dim, grey, green or blue
    const hue = 60 * ((g - b) / (max - min));
    if (hue < 5 || hue > 55) continue; // red-orange to yellow
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = histogram.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b;
    histogram.set(key, bin);
  }
  const ranked = [...histogram.values()].sort((a, b) => b.n - a.n)
    .map(bin => [Math.round(bin.r / bin.n), Math.round(bin.g / bin.n), Math.round(bin.b / bin.n)]);
  const picked: number[][] = [];
  for (const colour of ranked) {
    if (picked.length >= count) break;
    if (picked.every(c => Math.hypot(c[0] - colour[0], c[1] - colour[1], c[2] - colour[2]) >= distance)) picked.push(colour);
  }
  return picked.map(([r, g, b]) => (r << 16) | (g << 8) | b);
}

/** Whether a layer image at world x (scroll factor `scroll`) touches the view at camera scroll `cameraX`. */
export function onScreen(x: number, width: number, scroll: number, cameraX: number, viewWidth: number, margin = 16): boolean {
  const left = x - cameraX * scroll;
  return left < viewWidth + margin && left + width > -margin;
}

/**
 * Points on the water (full-size px, flat [x, y, x, y, …]) on a `step` grid below the waterline:
 * every opaque one, and the bright ones (luma ≥ 0.7, where sky and sun are reflected) for sparkles.
 */
export function waterPoints(p: Pixels, line: number, step = 8): { all: number[]; bright: number[] } {
  const all: number[] = [], bright: number[] = [];
  if (line < 0) return { all, bright };
  const s = Math.max(1, Math.round(step / p.scale));
  for (let y = Math.ceil(line / p.scale); y < p.height; y += s) {
    for (let x = 0; x < p.width; x += s) {
      const i = (y * p.width + x) * 4;
      if (p.data[i + 3] < 250) continue;
      all.push(x * p.scale, y * p.scale);
      if ((0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2]) / 255 >= 0.7) bright.push(x * p.scale, y * p.scale);
    }
  }
  return { all, bright };
}

/** A water surface on the stage: its world x range, the world row of its waterline and its image. */
export interface WaterSpan { x0: number; x1: number; y: number; image: Phaser.GameObjects.Image }

/** The world waterline under x, or null where there is no water. */
export function waterlineAt(spans: readonly WaterSpan[], x: number): number | null {
  for (const span of spans) if (x >= span.x0 && x < span.x1) return span.y;
  return null;
}

/** Where a sprite's mirror image goes: its feet at `feet` mirror to 2·waterline − feet. */
export const mirrorY = (waterline: number, feet: number) => 2 * waterline - feet;
