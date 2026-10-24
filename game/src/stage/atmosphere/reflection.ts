import Phaser from 'phaser';
import { newUniforms, useLayerPipeline } from './pipeline';
import { mirrorY, revealAlpha, waterlineAt, type WaterSpan } from './analysis';

/** A mask that is the stage's water: copies of the water layers (not on the display list). */
export function waterMask(scene: Phaser.Scene, spans: readonly WaterSpan[]) {
  const source = scene.make.container({ x: 0, y: 0 }, false);
  for (const span of spans) {
    source.add(scene.make.image({ x: span.image.x, y: span.image.y, key: span.image.texture.key, add: false }).setOrigin(0));
  }
  const mask = new Phaser.Display.Masks.BitmapMask(scene, source);
  return { mask, destroy: () => { mask.destroy(); source.destroy(); } };
}

/**
 * An actor's mirror image in the water: a flipped, tinted, rippled copy that follows the sprite's
 * frame every frame, masked to the water so it never shows on the bank.
 */
export class Reflection {
  readonly image: Phaser.GameObjects.Sprite;

  constructor(private source: Phaser.GameObjects.Sprite, private spans: readonly WaterSpan[], alpha: number, tint: number,
    depth: number, mask: Phaser.Display.Masks.BitmapMask) {
    const scene = source.scene;
    this.image = scene.add.sprite(source.x, source.y, source.texture.key, source.frame.name)
      .setOrigin(source.originX, source.originY).setFlipY(true).setAlpha(alpha).setTint(tint).setDepth(depth);
    const uniforms = newUniforms();
    uniforms.water.set([0, 1.2, 0, 0]); // ripple the whole mirror image, no shimmer, no blur
    useLayerPipeline(this.image, uniforms);
    this.image.setMask(mask);
    this.update();
  }

  update() {
    const { source, image } = this;
    const line = waterlineAt(this.spans, source.x);
    image.setVisible(source.visible && source.active && line !== null);
    if (line === null) return;
    if (image.texture !== source.texture || image.frame.name !== source.frame.name) image.setTexture(source.texture.key, source.frame.name);
    image.setFlipX(source.flipX);
    image.setPosition(source.x, mirrorY(line, source.y));
  }

  destroy() { this.image.destroy(); }
}

/**
 * The wrong reflection (anomaly-reveal): what is not there – Rusty Creek's rusted maze – flickers in the
 * water around a point for a while, strongest in the middle of it, then the pond settles.
 */
export class WrongReflection {
  private image: Phaser.GameObjects.Image;
  private start = 0;
  private duration = 0;

  constructor(scene: Phaser.Scene, texture: string, depth: number, mask: Phaser.Display.Masks.BitmapMask, alpha: number) {
    this.image = scene.add.image(0, 0, texture).setOrigin(0.5, 0).setDepth(depth).setVisible(false).setMask(mask);
    this.peak = alpha;
    const uniforms = newUniforms();
    uniforms.water.set([0, 2.5, 0.3, 0]);
    useLayerPipeline(this.image, uniforms);
  }
  private peak: number;

  show(x: number, waterline: number, now: number, duration: number) {
    this.start = now; this.duration = duration;
    this.image.setPosition(x, waterline).setVisible(true).setAlpha(0);
  }

  get active() { return this.image.visible; }

  update(now: number) {
    if (!this.image.visible) return;
    const alpha = revealAlpha(now - this.start, this.duration);
    if (alpha === null) { this.image.setVisible(false); return; }
    this.image.setAlpha(alpha * this.peak);
  }

  destroy() { this.image.destroy(); }
}
