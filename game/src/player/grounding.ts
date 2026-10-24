import type { Material } from './surfaces';

/** Half the planted-feet span (walk double support, compare.py feet): on a slope the lower foot sits this far out. */
export const FEET_HALF_SPAN = 8;
/** The extra settle of a landing: px pressed into the ground at touchdown, easing out over the landing clip. */
export const LANDING_SETTLE = { soft: 1, hard: 2 };
/** Sink eases in and out at this rate (1/s), so stepping from stone onto grass is a settle, not a pop. */
export const SINK_RATE = 30;

export interface GroundInput {
  material: Material; grounded: boolean; slope: number;
  /** 0–1: how much of the landing clip is left; `hard` picks the bigger settle. */
  landing: number; hard: boolean;
}

/**
 * Where the feet should be drawn below the physics contact (px, visual only): the surface's sink, plus the
 * lower foot on a slope (pixel art is not rotated, so the sprite drops until neither foot floats), plus a
 * landing settle in place of a squash – the drawn landing poses carry the squash, the ground takes the weight.
 */
export function sinkTarget(input: GroundInput) {
  if (!input.grounded) return 0;
  const slope = Math.min(4, Math.abs(input.slope) * FEET_HALF_SPAN);
  const settle = (input.hard ? LANDING_SETTLE.hard : LANDING_SETTLE.soft) * Math.max(0, Math.min(1, input.landing));
  return input.material.sink + slope + settle;
}

/** Rows of the sprite hidden by the ground: the surface's cover, never more than the feet sank. */
export function coverRows(input: GroundInput, sink: number) {
  return input.grounded ? Math.max(0, Math.min(Math.round(sink), input.material.cover ?? 0)) : 0;
}

export class Grounding {
  sink = 0;
  /** Eases toward the target; leaving the ground lifts the feet out at once (a jump never drags its feet). */
  update(input: GroundInput, dt: number) {
    const target = sinkTarget(input);
    this.sink = !input.grounded ? 0 : this.sink + (target - this.sink) * (1 - Math.exp(-SINK_RATE * dt));
    if (Math.abs(this.sink - target) < 0.05) this.sink = target;
    return { offset: Math.round(this.sink), cover: coverRows(input, this.sink) };
  }
}

/** Stable pseudo-random 0–1 per integer (world pixel column), so grass in front of the feet stays put in the world. */
export function hash(n: number) {
  let h = (n | 0) * 374761393 ^ 0x5bd1e995;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

/** Tufts over the feet: world columns within `half` px of x, each with a height ≤ cover + 2 and a colour index. */
export function blades(x: number, half: number, cover: number, colors: number) {
  const out: { x: number; height: number; color: number }[] = [];
  if (cover <= 0 || colors <= 0) return out;
  for (let column = Math.floor(x - half); column <= Math.ceil(x + half); column++) {
    const r = hash(column);
    if (r < 0.45) continue;
    out.push({ x: column, height: 1 + Math.floor(hash(column * 7 + 3) * (cover + 2)), color: Math.floor(r * 997) % colors });
  }
  return out;
}
