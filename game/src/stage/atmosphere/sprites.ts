import type Phaser from 'phaser';
import type { AnimationTable } from '../assets';

/**
 * Animations for the atmosphere's sprite sheets (fx-leaves, fx-water), made once from the sheet's
 * anims.json (cached by the loader as `<board>.anims`). Returns the animation keys per clip, or null
 * when the sheet is not loaded.
 */
export function sheetAnimations(scene: Phaser.Scene, board: string): Record<string, string> | null {
  if (!scene.textures.exists(board)) return null;
  const clips = scene.cache.json.get(`${board}.anims`) as AnimationTable | undefined;
  if (!clips) return null;
  const keys: Record<string, string> = {};
  for (const [name, clip] of Object.entries(clips)) {
    const key = `${board}:${name}`;
    if (!scene.anims.exists(key)) {
      scene.anims.create({ key, frameRate: clip.fps, repeat: clip.loop ? -1 : 0,
        frames: scene.anims.generateFrameNames(board, { prefix: `${name}-`, start: 0, end: clip.frames - 1, zeroPad: 2 }) });
    }
    keys[name] = key;
  }
  return keys;
}

/** A small deterministic random (mulberry32), so placements are the same on every run. */
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
