/**
 * The wind, as pure numbers. The layer shader (pipeline.ts) evaluates the same formulas per pixel;
 * the leaves read `gustAt` to lean with the same gusts the foliage shows.
 */
import type { LayerFx, Wind } from './config';

const TAU = Math.PI * 2;

/** 0–1: how strongly a gust is passing at layer x (px) and time t (s). Gust fronts travel downwind. */
export function gustAt(wind: Wind, x: number, t: number): number {
  const phase = ((x - wind.direction * wind.gustSpeed * t) / wind.gustLength) * TAU;
  const front = Math.max(0, Math.sin(phase)) ** 4;
  return front * (0.55 + 0.45 * Math.sin(t * 0.21));
}

/** 0–1 sway weight of a pixel `height` px above its anchor (smoothstep over the layer's reach). */
export function swayWeight(height: number, reach: number): number {
  const w = Math.min(1, Math.max(0, height / reach));
  return w * w * (3 - 2 * w);
}

/** Horizontal displacement in px of a layer pixel at x, `height` px above its anchor, at time t (s). */
export function swayAt(wind: Wind, layer: Pick<LayerFx, 'sway' | 'reach'>, x: number, height: number, t: number): number {
  const steady = wind.base * Math.sin(TAU * wind.frequency * t + x * 0.004 + height * 0.01);
  const lean = wind.gust * gustAt(wind, x, t) * wind.direction;
  return layer.sway * swayWeight(height, layer.reach) * (steady + lean);
}

/** The most a layer can move: never more than its amplitude × (base + gust). */
export const maxSway = (wind: Wind, layer: Pick<LayerFx, 'sway'>) => layer.sway * (wind.base + wind.gust);

/** GLSL twin of gustAt / swayAt (uWind = base, gust, gustSpeed, gustLength; uWind2.xy = 2π·frequency, direction). */
export const WIND_GLSL = /* glsl */ `
float gustAt(float x, float t) {
  float phase = (x - uWind2.y * uWind.z * t) / uWind.w * 6.2831853;
  float s = max(0.0, sin(phase));
  return s * s * s * s * (0.55 + 0.45 * sin(t * 0.21));
}
float swayAt(float x, float height, float t) {
  float steady = uWind.x * sin(uWind2.x * t + x * 0.004 + height * 0.01);
  return steady + uWind.y * gustAt(x, t) * uWind2.y;
}
`;
