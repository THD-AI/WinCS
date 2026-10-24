import type Phaser from 'phaser';
import type { StageManifest } from './manifest';
export interface Bounds { x: number; y: number; width: number; height: number }
/** `focus`: the ground height the camera frames; it only moves when the hero leaves the vertical dead zone. */
export interface Follow { x: number; y: number; lead: number; focus?: number }
export interface Target { x: number; y: number; vx: number; grounded?: boolean }
export function gridBounds(manifest: StageManifest): Bounds {
  const xs = manifest.chunks.map(c => c.x * manifest.chunkSize[0]);
  const ys = manifest.chunks.map(c => c.y * manifest.chunkSize[1]);
  return { x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs) + manifest.chunkSize[0],
    height: Math.max(...ys) - Math.min(...ys) + manifest.chunkSize[1] };
}
/** Look-ahead in px at full run speed (258 px/s and above), and the speed below which there is none. */
export const LEAD = 120;
export const LEAD_SPEED = 258;
/** Vertical dead zone around the framed ground: slopes and steps inside it never move the camera. */
export const DEAD_ZONE = { up: 40, down: 16 };
/** While airborne the focus holds, unless the hero rises this far above it (a climb) or drops below it. */
export const AIR_ZONE = { up: 150, down: 0 };
/** Where the framed ground sits on screen, from the top (0–1). */
export const FRAME_Y = 0.64;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const ease = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

/** Moves `focus` just enough to keep `y` inside [focus − up, focus + down]. */
export function deadZone(focus: number, y: number, zone: { up: number; down: number }) {
  return clamp(focus, y - zone.down, y + zone.up);
}

/**
 * Keep fractional smoothing state, but expose whole pixels that keep the hero's own screen position steady:
 * the camera is the hero's rounded position minus the rounded hero-to-camera offset, so at a steady
 * (stride-paced) speed the hero does not shimmer by a pixel against the scenery while the camera eases.
 */
export function follow(state: Follow, target: Target, bounds: Bounds, dt: number, width = 1280, height = 720) {
  state.lead = ease(state.lead, clamp(target.vx / LEAD_SPEED, -1, 1) * LEAD, 3.5, dt);
  state.focus = deadZone(state.focus ?? target.y, target.y, target.grounded === false ? AIR_ZONE : DEAD_ZONE);
  const maxX = bounds.x + Math.max(0, bounds.width - width);
  const maxY = bounds.y + Math.max(0, bounds.height - height);
  state.x = clamp(ease(state.x, clamp(target.x - width / 2 + state.lead, bounds.x, maxX), 8, dt), bounds.x, maxX);
  state.y = clamp(ease(state.y, clamp(state.focus - height * FRAME_Y, bounds.y, maxY), 5, dt), bounds.y, maxY);
  const snap = (hero: number, camera: number, min: number, max: number) =>
    clamp(Math.round(hero) - Math.round(hero - camera), Math.ceil(min), Math.floor(max));
  return { x: snap(target.x, state.x, bounds.x, maxX), y: snap(target.y, state.y, bounds.y, maxY) };
}
/**
 * The room the hero is in: the grid row under `y`, only that row's chunks. A region's rows are rooms (the level
 * row, the underground under it) joined by doors, never by open sky: the camera never shows the row next door,
 * and the parallax plates (which scroll only sideways) never slide against the ground. One row = the whole grid.
 */
export function roomBounds(manifest: StageManifest, y: number): Bounds {
  const [w, h] = manifest.chunkSize;
  const rows = [...new Set(manifest.chunks.map(c => c.y))];
  const row = rows.reduce((best, r) => Math.abs((r + 0.5) * h - y) < Math.abs((best + 0.5) * h - y) ? r : best, rows[0]);
  const xs = manifest.chunks.filter(c => c.y === row).map(c => c.x * w);
  return { x: Math.min(...xs), y: row * h, width: Math.max(...xs) - Math.min(...xs) + w, height: h };
}
export function cameraFollow(scene: Phaser.Scene, manifest: StageManifest) {
  const camera = scene.cameras.main;
  camera.roundPixels = true;
  const state: Follow = { x: camera.scrollX, y: camera.scrollY, lead: 0 };
  let room: Bounds | undefined;
  return (target: Target, milliseconds: number) => {
    const here = roomBounds(manifest, target.y);
    if (!room || here.y !== room.y) {  // entering a room (the start, a door): frame it at once, no easing across
      room = here;
      state.lead = 0; state.focus = target.y;
      state.x = Math.max(room.x, Math.min(room.x + room.width - camera.width, target.x - camera.width / 2));
      state.y = Math.max(room.y, Math.min(room.y + room.height - camera.height, target.y - camera.height * FRAME_Y));
    }
    const position = follow(state, target, room, Math.min(milliseconds / 1000, 0.1), camera.width, camera.height);
    camera.setScroll(position.x, position.y);
  };
}
