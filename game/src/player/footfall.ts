import type Phaser from 'phaser';
import type { Catalogue } from './animation';

/** A foot is a run of opaque pixels at least this wide in the frame's bottom rows (a 3 px toe-off is not a step). */
export const FOOT_WIDTH = 6;
export const FOOT_BAND = 2;

/** Planted feet in one frame: `alpha` is the frame's bottom `FOOT_BAND` rows, row-major, `width` px wide. */
export function plantedFeet(alpha: ArrayLike<number>, width: number, threshold = 128) {
  const rows = Math.floor(alpha.length / width);
  const solid: boolean[] = [];
  for (let x = 0; x < width; x++) {
    let any = false;
    for (let y = 0; y < rows && !any; y++) any = alpha[y * width + x] > threshold;
    solid.push(any);
  }
  const runs: [number, number][] = [];
  for (let x = 0; x < width; x++) if (solid[x]) {
    const last = runs[runs.length - 1];
    if (last && x - last[1] <= 2) last[1] = x; else runs.push([x, x]);
  }
  return runs.filter(([a, b]) => b - a + 1 >= FOOT_WIDTH).length;
}

/**
 * Footfall frames of a looping cycle: where the number of planted feet rises (a heel strike adds a foot to the
 * ground). Measured on the approved hero: walk 00/04 (double support), run 01/05 (after the flight frames).
 */
export function contactFrames(feet: number[]) {
  return feet.flatMap((count, i) => count > feet[(i - 1 + feet.length) % feet.length] ? [i] : []);
}

/** The bottom rows' alpha of an atlas frame, read once from the texture source. */
function bottomAlpha(scene: Phaser.Scene, board: string, name: string, canvas: HTMLCanvasElement) {
  const frame = scene.textures.getFrame(board, name);
  if (!frame) return null;
  const image = frame.source.image as CanvasImageSource;
  const { cutX, cutY, cutWidth, cutHeight } = frame;
  canvas.width = cutWidth; canvas.height = FOOT_BAND;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.clearRect(0, 0, cutWidth, FOOT_BAND);
  context.drawImage(image, cutX, cutY + cutHeight - FOOT_BAND, cutWidth, FOOT_BAND, 0, 0, cutWidth, FOOT_BAND);
  const rgba = context.getImageData(0, 0, cutWidth, FOOT_BAND).data;
  const alpha = new Uint8Array(cutWidth * FOOT_BAND);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { alpha, width: cutWidth };
}

/** `clip → footfall frame indices` for every strided cycle, measured from the atlas pixels. */
export function footfalls(scene: Phaser.Scene, clips: Catalogue): Record<string, number[]> {
  const table: Record<string, number[]> = {};
  const canvas = document.createElement('canvas');
  for (const clip of Object.values(clips)) {
    if (!clip.stride || !clip.loop) continue;
    try {
      const feet: number[] = [];
      for (let n = 0; n < clip.frames; n++) {
        const read = bottomAlpha(scene, clip.board, `${clip.name}-${String(n).padStart(2, '0')}`, canvas);
        if (!read) throw new Error(`no frame ${clip.name}-${n}`);
        feet.push(plantedFeet(read.alpha, read.width));
      }
      table[clip.name] = contactFrames(feet);
    } catch (error) {
      console.warn('footfalls', clip.name, error);
      table[clip.name] = [0, Math.floor(clip.frames / 2)]; // contact/down/passing/up twice
    }
  }
  return table;
}
