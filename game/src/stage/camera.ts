import type Phaser from 'phaser';
import type { StageManifest } from './manifest';
export interface Bounds { x: number; y: number; width: number; height: number }
export interface Follow { x: number; y: number; lead: number }
export interface Target { x: number; y: number; vx: number }
export function gridBounds(manifest: StageManifest): Bounds {
  const xs = manifest.chunks.map(c => c.x * manifest.chunkSize[0]);
  const ys = manifest.chunks.map(c => c.y * manifest.chunkSize[1]);
  return { x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs) + manifest.chunkSize[0],
    height: Math.max(...ys) - Math.min(...ys) + manifest.chunkSize[1] };
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const ease = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));
/** Keep fractional smoothing state, but only expose integer camera coordinates. */
export function follow(state: Follow, target: Target, bounds: Bounds, dt: number, width = 1280, height = 720) {
  state.lead = ease(state.lead, clamp(target.vx / 258, -1, 1) * 120, 7, dt);
  const maxX = bounds.x + Math.max(0, bounds.width - width);
  const maxY = bounds.y + Math.max(0, bounds.height - height);
  state.x = clamp(ease(state.x, clamp(target.x - width / 2 + state.lead, bounds.x, maxX), 8, dt), bounds.x, maxX);
  state.y = clamp(ease(state.y, clamp(target.y - height * 0.64, bounds.y, maxY), 5, dt), bounds.y, maxY);
  return { x: Math.round(state.x), y: Math.round(state.y) };
}
export function cameraFollow(scene: Phaser.Scene, manifest: StageManifest) {
  const camera = scene.cameras.main, bounds = gridBounds(manifest);
  camera.roundPixels = true;
  const state = { x: camera.scrollX, y: camera.scrollY, lead: 0 };
  return (target: Target, milliseconds: number) => {
    const position = follow(state, target, bounds, Math.min(milliseconds / 1000, 0.1), camera.width, camera.height);
    camera.setScroll(position.x, position.y);
  };
}
