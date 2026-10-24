import type Phaser from 'phaser';
import type { Water } from './config';
import { seeded } from './sprites';

/**
 * Life on the water from the fx-water sheet: lily pads bobbing on the near half of the pond, rings
 * opening where something touched the surface, sparkles on the bright (sky-lit) water. Positions come
 * from the water layer's own pixels (analysis.waterPoints); sprites are pooled, nothing allocates per frame.
 */
export class WaterLife {
  private pads: Phaser.GameObjects.Sprite[] = [];
  private ripples: Phaser.GameObjects.Sprite[] = [];
  private sparkles: Phaser.GameObjects.Sprite[] = [];
  private all: number[] = [];
  private bright: number[] = [];
  private random = seeded(404);
  private nextRipple = 0;
  private nextSparkle = 0;

  constructor(private scene: Phaser.Scene, private keys: Record<string, string>, private config: Water, private depth: number) {
    const pool = (key: string | undefined, count: number, into: Phaser.GameObjects.Sprite[]) => {
      if (!key) return;
      for (let i = 0; i < count; i++) {
        const sprite = scene.add.sprite(0, 0, 'fx-water').setVisible(false).setDepth(depth + 0.02);
        sprite.on('animationcomplete', () => sprite.setVisible(false));
        into.push(sprite);
      }
    };
    pool(keys.ripple, 6, this.ripples);
    pool(keys.sparkle, 10, this.sparkles);
  }

  /** A water surface: `points` and `bright` are flat [x, y, …] in its image's px; `line` its waterline row. */
  addSurface(x: number, y: number, width: number, line: number, points: number[], bright: number[]) {
    for (let i = 0; i < points.length; i += 2) this.all.push(x + points[i], y + points[i + 1]);
    for (let i = 0; i < bright.length; i += 2) this.bright.push(x + bright[i], y + bright[i + 1]);
    if (!this.keys['lily-bob'] || !this.config.pads) return;
    // Pads float on the near half of the band (below its middle).
    const near: number[] = [];
    let bottom = line;
    for (let i = 1; i < points.length; i += 2) bottom = Math.max(bottom, points[i]);
    const middle = (line + bottom) / 2;
    for (let i = 0; i < points.length; i += 2) if (points[i + 1] >= middle && points[i + 1] <= bottom - 8) near.push(points[i], points[i + 1]);
    const count = Math.round((width / 1000) * this.config.pads);
    for (let n = 0; n < count && near.length; n++) {
      const i = 2 * Math.floor(this.random() * (near.length / 2));
      const pad = this.scene.add.sprite(x + near[i], y + near[i + 1], 'fx-water').setDepth(this.depth + 0.01)
        .setTint(this.config.padTint).setScale(this.config.padScale).setFlipX(this.random() < 0.5);
      pad.play({ key: this.keys['lily-bob'], startFrame: Math.floor(this.random() * 4) });
      this.pads.push(pad);
    }
  }

  private spawn(pool: Phaser.GameObjects.Sprite[], key: string | undefined, points: number[], camera: Phaser.Cameras.Scene2D.Camera) {
    if (!key || !points.length) return;
    let sprite: Phaser.GameObjects.Sprite | undefined;
    for (let i = 0; i < pool.length; i++) if (!pool[i].visible) { sprite = pool[i]; break; }
    if (!sprite) return;
    for (let tries = 0; tries < 6; tries++) {
      const i = 2 * Math.floor(Math.random() * (points.length / 2));
      const px = points[i], py = points[i + 1];
      if (px < camera.scrollX || px > camera.scrollX + camera.width || py < camera.scrollY || py > camera.scrollY + camera.height) continue;
      sprite.setPosition(px, py).setVisible(true).play(key);
      return;
    }
  }

  update(time: number, camera: Phaser.Cameras.Scene2D.Camera) {
    if (this.config.ripples > 0 && time >= this.nextRipple) {
      this.spawn(this.ripples, this.keys.ripple, this.all, camera);
      this.nextRipple = time + this.config.ripples * (0.5 + Math.random());
    }
    if (this.config.sparkles > 0 && time >= this.nextSparkle) {
      this.spawn(this.sparkles, this.keys.sparkle, this.bright, camera);
      this.nextSparkle = time + this.config.sparkles * (0.5 + Math.random());
    }
  }

  destroy() {
    for (const sprite of [...this.pads, ...this.ripples, ...this.sparkles]) sprite.destroy();
  }
}
