import type { AnimationTable } from '../stage/assets';

/**
 * One timing source for the chair's moves (#156): each clip's speed and length come from its board's
 * `anims.json` (export_atlas.py), never from numbers in the gameplay code. A model built without a table (tests,
 * a board not loaded yet) uses the boards' authored defaults: 12 fps and the frame counts it names.
 */
export type Clips = Partial<AnimationTable>;
export const DEFAULT_FPS = 12;

/** Seconds per frame of a clip. */
export const frameTime = (clips: Clips | undefined, name: string) => 1 / (clips?.[name]?.fps ?? DEFAULT_FPS);
/** A clip's frame count, or the authored one. */
export const frameCount = (clips: Clips | undefined, name: string, authored: number) => clips?.[name]?.frames ?? authored;
/** Seconds for `frames` frames of a clip. */
export const clipTime = (clips: Clips | undefined, name: string, frames: number) => frames * frameTime(clips, name);
/** The frame a clip shows `elapsed` seconds in (not clamped). */
export const frameAt = (clips: Clips | undefined, name: string, elapsed: number) =>
  Math.floor((elapsed + 1e-9) / frameTime(clips, name));
