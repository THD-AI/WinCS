import type { Point } from './collision';

/** The ambient motion's numbers and pure parts (ambient.ts draws them). */
export const LAMP = { radius: 120, alpha: 0.3, tint: 0xffb45a, motes: 5, drift: [70, 46] as const };
export const DRIP = { every: [2.2, 6] as const, gravity: 900, tint: 0xbfe0ff, splash: 3 };

/** Where a drop from (x, y) lands: the first walk line under it, else the room's bottom. */
export function landing(lines: Point[][], x: number, y: number, bottom: number): number {
  let best = bottom;
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    const ly = a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1, b[0] - a[0]);
    if (ly > y + 4 && ly < best) best = ly;
  }
  return best;
}

/** A lantern's brightness at time t (s), 0.55–1: a slow breath, a quick flutter, and now and then a short dip. */
export function flicker(t: number, seed: number): number {
  const breath = 0.06 * Math.sin(t * 1.7 + seed);
  const flutter = 0.05 * Math.sin(t * 13.1 + seed * 3) * Math.sin(t * 7.3 + seed);
  const dip = Math.max(0, Math.sin(t * 0.61 + seed * 5) - 0.96) * 9;  // about once every ten seconds, ~0.3 s
  return Math.max(0.55, Math.min(1, 0.9 + breath + flutter - dip));
}
