import type Phaser from 'phaser';
import type { Position } from '../core/events';

/** Small game particles; no raster assets or changes to the approved art. */
export function deathDust(scene: Phaser.Scene, position: Position) {
  for (let i = 0; i < 18; i++) {
    const pixel = scene.add.rectangle(position.x - 14 + Math.random() * 28,
      position.y - Math.random() * 76, 2, 2, [0x287c8e, 0x345e83, 0xeadbb4][i % 3]).setDepth(110);
    scene.tweens.add({ targets: pixel, x: pixel.x - 20 + Math.random() * 40,
      y: pixel.y - 10 - Math.random() * 20, alpha: 0, duration: 400, onComplete: () => pixel.destroy() });
  }
}
