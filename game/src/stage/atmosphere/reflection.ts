import Phaser from 'phaser';
import { newUniforms, useLayerPipeline, type LayerPipeline } from './pipeline';
import { mirrorY, waterlineAt, type WaterSpan } from './analysis';

/**
 * An actor's mirror image in the water: a flipped, tinted, rippled copy that follows the sprite's
 * frame every frame, masked to the water layers so it never shows on the bank.
 */
export class Reflection {
  readonly image: Phaser.GameObjects.Sprite;
  private mask?: Phaser.Display.Masks.BitmapMask;
  private maskSource?: Phaser.GameObjects.Container;

  constructor(private source: Phaser.GameObjects.Sprite, private spans: readonly WaterSpan[], alpha: number, tint: number,
    depth: number, pipeline: LayerPipeline | null) {
    const scene = source.scene;
    this.image = scene.add.sprite(source.x, source.y, source.texture.key, source.frame.name)
      .setOrigin(source.originX, source.originY).setFlipY(true).setAlpha(alpha).setTint(tint).setDepth(depth);
    if (pipeline) {
      const uniforms = newUniforms();
      uniforms.water.set([0, 1.2, 0, 0]); // ripple the whole mirror image, no shimmer, no blur
      useLayerPipeline(this.image, uniforms);
      this.maskSource = scene.make.container({ x: 0, y: 0 }, false);
      for (const span of spans) {
        this.maskSource.add(scene.make.image({ x: span.image.x, y: span.image.y, key: span.image.texture.key, add: false }).setOrigin(0));
      }
      this.mask = new Phaser.Display.Masks.BitmapMask(scene, this.maskSource);
      this.image.setMask(this.mask);
    }
    this.update();
  }

  update() {
    const { source, image } = this;
    const line = waterlineAt(this.spans, source.x);
    image.setVisible(source.visible && line !== null && this.mask !== undefined);
    if (line === null) return;
    if (image.texture !== source.texture || image.frame.name !== source.frame.name) image.setTexture(source.texture.key, source.frame.name);
    image.setFlipX(source.flipX);
    image.setPosition(source.x, mirrorY(line, source.y));
  }

  destroy() {
    this.image.destroy();
    this.mask?.destroy();
    this.maskSource?.destroy();
  }
}
