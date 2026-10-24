import type Phaser from 'phaser';
import type { Puff } from './surfaces';

export type PuffKind = 'step' | 'land' | 'hard-land';
export interface Particle { dx: number; dy: number; size: [number, number]; color: string; life: number; front: boolean; fall: number }

/** How much a step, a landing and a hard landing kick up, as multiples of the surface's `count`. */
const SCALE: Record<PuffKind, { count: number; spread: number; rise: number }> = {
  step: { count: 1, spread: 8, rise: 7 },
  land: { count: 2, spread: 16, rise: 9 },
  'hard-land': { count: 3.5, spread: 26, rise: 14 },
};

/**
 * The particles of one puff, as offsets from the foot (pure, for tests). A step kicks backwards (against
 * `direction`); a landing spreads to both sides. Blades and leaves are taller and drift down after the rise.
 */
export function puffParticles(puff: Puff, kind: PuffKind, direction: number, random = Math.random): Particle[] {
  const scale = SCALE[kind];
  const count = Math.round(puff.count * scale.count);
  return Array.from({ length: count }, (_, i) => {
    const side = kind === 'step' ? -(Math.sign(direction) || 1) : i % 2 ? 1 : -1;
    const dx = side * (2 + random() * scale.spread);
    const dy = -(2 + random() * scale.rise);
    const size: [number, number] = puff.shape === 'blade' ? [1, 3] : puff.shape === 'leaf' ? [2, 1] : [2, 2];
    return { dx, dy, size, color: puff.colors[i % puff.colors.length], life: 260 + random() * 220,
      front: i % 2 === 0, fall: puff.shape === 'dust' ? 0 : 4 + random() * 4 };
  });
}

export const FX_BOARD = 'fx-ground';

/**
 * Where the drawn puffs go (pure, for tests): a step kicks one puff back from the planted foot, mirrored against
 * the walking direction; a landing kicks one to each side; a hard landing wider, with procedural debris on top.
 */
export function puffSprites(kind: PuffKind, direction: number) {
  const back = -(Math.sign(direction) || 1);
  if (kind === 'step') return [{ dx: back * 6, flip: back < 0 }];
  const spread = kind === 'hard-land' ? 14 : 8;
  return [{ dx: -spread, flip: true }, { dx: spread, flip: false }];
}

/** Plays an fx-ground clip once at its anims.json fps; false when the atlas or clip is missing. */
function playSprite(scene: Phaser.Scene, clip: string, x: number, y: number, flip: boolean, depth: number) {
  const table = scene.cache.json.get(`${FX_BOARD}.anims`) as Record<string, { frames: number; fps: number }> | undefined;
  const meta = table?.[clip];
  if (!meta || !scene.textures.exists(FX_BOARD)) return false;
  const key = `${FX_BOARD}:${clip}`;
  if (!scene.anims.exists(key)) scene.anims.create({ key, frameRate: meta.fps, repeat: 0,
    frames: scene.anims.generateFrameNames(FX_BOARD, { prefix: `${clip}-`, start: 0, end: meta.frames - 1, zeroPad: 2 }) });
  const sprite = scene.add.sprite(Math.round(x), Math.round(y), FX_BOARD, `${clip}-00`).setOrigin(0.5, 1)
    .setFlipX(flip).setDepth(depth);
  sprite.play(key);
  sprite.once('animationcomplete', () => sprite.destroy());
  return true;
}

/** The surface's drawn puff (fx-ground) when it exists, else procedural pixels in the surface palette. */
export function spawnPuff(scene: Phaser.Scene, x: number, y: number, puff: Puff | undefined, kind: PuffKind,
  direction: number, depth = 100) {
  if (!puff) return;
  let drawn = false;
  if (puff.sprite) for (const s of puffSprites(kind, direction)) {
    drawn = playSprite(scene, puff.sprite, x + s.dx, y, s.flip, depth + 1) || drawn;
  }
  if (drawn && kind !== 'hard-land') return;
  for (const p of puffParticles(puff, kind, direction)) {
    const pixel = scene.add.rectangle(Math.round(x), Math.round(y - 1), p.size[0], p.size[1],
      Number.parseInt(p.color.slice(1), 16)).setOrigin(0.5, 1).setDepth(p.front ? depth + 1 : depth - 1);
    scene.tweens.add({ targets: pixel, x: pixel.x + p.dx, duration: p.life, ease: 'Quad.Out' });
    scene.tweens.add({ targets: pixel, y: pixel.y + p.dy, duration: p.life * 0.45, ease: 'Quad.Out',
      onComplete: () => scene.tweens.add({ targets: pixel, y: pixel.y + p.fall - p.dy * 0.4, alpha: 0,
        duration: p.life * 0.55, ease: 'Quad.In', onComplete: () => pixel.destroy() }) });
  }
}
