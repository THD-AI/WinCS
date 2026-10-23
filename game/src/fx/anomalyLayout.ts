/** Geometry for the anomaly language (docs/06): pure numbers, so the effects are tested without Phaser. */

export interface Rect { x: number; y: number; w: number; h: number }

/** One cropped copy of the art: the source rectangle and where its top-left lands. */
export interface Slice { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }

/** Image cut: the rectangle shifted sideways and repeated, each copy one more shift along. */
export function imageCut(area: Rect, shift: number, copies = 2): Slice[] {
  return Array.from({ length: copies }, (_, i) => ({
    sx: area.x, sy: area.y, sw: area.w, sh: area.h,
    dx: area.x + shift * (i + 1), dy: area.y,
  }));
}

/** Pixel stretch: one row of the art smeared down the whole area, so every pixel becomes a vertical streak. */
export interface Stretch { row: Slice; scaleY: number }

export function pixelStretch(area: Rect, rowOffset = 0): Stretch {
  const sy = area.y + Math.max(0, Math.min(area.h - 1, Math.round(rowOffset)));
  return { row: { sx: area.x, sy, sw: area.w, sh: 1, dx: area.x, dy: area.y }, scaleY: area.h };
}

/** A tiny seeded generator (mulberry32): the same seed always tears the same edge. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 404 void outline: the rectangle with torn edges – every `step` px the edge bites up to `depth` px inwards.
 * Points run clockwise from the top-left; all stay inside the rectangle.
 */
export function tornOutline(area: Rect, seed: number, step = 12, depth = 10): [number, number][] {
  const rand = seeded(seed);
  const bite = () => Math.round(rand() * depth);
  const out: [number, number][] = [];
  const { x, y, w, h } = area;
  for (let i = 0; i < w; i += step) out.push([x + i, y + bite()]);
  for (let i = 0; i < h; i += step) out.push([x + w - bite(), y + i]);
  for (let i = w; i > 0; i -= step) out.push([x + i, y + h - bite()]);
  for (let i = h; i > 0; i -= step) out.push([x + bite(), y + i]);
  return out;
}
