import type Phaser from 'phaser';
import type { Position } from '../core/events';
import type { Life } from './life';

export function lifePose(life: Life) {
  if (life.dead > 0) return { board: 'hero-death', frame: `death-${String(Math.min(11, Math.floor((1 - life.dead) * 12))).padStart(2, '0')}` };
  if (life.knock > 0) {
    const time = 1 - life.invulnerable;
    return { board: 'hero-hurt', frame: time < 0.08 ? 'hit-00'
      : `knockback-${String(Math.min(2, Math.floor((time - 0.08) * 12))).padStart(2, '0')}` };
  }
  return null;
}
export function paintLife(sprite: Phaser.GameObjects.Sprite, life: Life, time: number) {
  if (life.dead === 0 && life.invulnerable > 0.92) sprite.setTintFill(0xffffff);
  else sprite.clearTint();
  sprite.setAlpha(life.dead === 0 && life.invulnerable > 0 && Math.floor(time / 80) % 2 ? 0.35 : 1);
}
/** Small game particles; no raster assets or changes to the approved art. */
export function deathDust(scene: Phaser.Scene, position: Position) {
  for (let i = 0; i < 18; i++) {
    const pixel = scene.add.rectangle(position.x - 14 + Math.random() * 28,
      position.y - Math.random() * 76, 2, 2, [0x287c8e, 0x345e83, 0xeadbb4][i % 3]).setDepth(110);
    scene.tweens.add({ targets: pixel, x: pixel.x - 20 + Math.random() * 40,
      y: pixel.y - 10 - Math.random() * 20, alpha: 0, duration: 400, onComplete: () => pixel.destroy() });
  }
}
