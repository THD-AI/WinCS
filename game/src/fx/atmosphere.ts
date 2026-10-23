import Phaser from 'phaser';
import { findWaterline, leafDrift, mirroredTop, rippleOffset, StageState } from './atmosphereLayout';

/**
 * Atmosphere over a stage chunk (#36, docs/04 layers 4, 7, 8): the foreground blur, falling leaves and the
 * water reflection. Everything is built once; per frame only the reflection strips move a pixel or two.
 */

const LEAF_KEY = 'fx-leaf';
const LEAF_COLOURS = [0xd9a03a, 0xc9622b, 0xe8c454, 0x9a4a24];
const STRIP = 4;

/** Softens the foreground layer (scroll 1.15–1.2) with a WebGL blur; returns false on the Canvas renderer. */
export function blurForeground(layer: Phaser.GameObjects.Image, strength = 1.2): boolean {
  if (!layer.preFX) return false;
  layer.preFX.addBlur(1, 2, 2, strength);
  return true;
}

/** Leaves drifting across the view at foreground parallax; they fall when clean and rise in the anomaly state. */
export function addLeaves(scene: Phaser.Scene, state: StageState, scroll = 1.15): Phaser.GameObjects.Particles.ParticleEmitter {
  if (!scene.textures.exists(LEAF_KEY)) {
    const g = scene.make.graphics({}, false);
    LEAF_COLOURS.forEach((c, i) => g.fillStyle(c).fillRect(i * 6 + 1, 0, 4, 3).fillRect(i * 6, 1, 6, 1));
    g.generateTexture(LEAF_KEY, LEAF_COLOURS.length * 6, 3).destroy();
    LEAF_COLOURS.forEach((_, i) => scene.textures.get(LEAF_KEY).add(i, 0, i * 6, 0, 6, 3));
  }
  const { width, height } = scene.scale;
  const drift = leafDrift(state);
  const emitter = scene.add.particles(0, 0, LEAF_KEY, {
    frame: LEAF_COLOURS.map((_, i) => i),
    x: { min: -40, max: width + 200 },
    y: state === 'clean' ? -10 : height + 10,
    speedX: { min: drift.speedX[0], max: drift.speedX[1] },
    speedY: { min: drift.speedY[0], max: drift.speedY[1] },
    rotate: { min: 0, max: 360 },
    scale: { min: 2, max: 3.5 },
    lifespan: 16_000,
    frequency: 180,
    advance: 12_000, // start with the view already full of leaves
  }).setScrollFactor(0).setDepth(50);
  // Screen-space emitter, nudged against the camera so the leaves pass faster than the scenery (parallax > 1).
  const cam = scene.cameras.main;
  let lastX = cam.scrollX;
  const follow = () => {
    const dx = (cam.scrollX - lastX) * scroll;
    lastX = cam.scrollX;
    if (dx) emitter.forEachAlive((p) => { p.x -= dx; }, undefined);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, follow);
  emitter.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, follow));
  return emitter;
}

/**
 * The water mirrors `layers` (docs/04: 1–6) about the waterline, masked to the water layer, with a ripple.
 * The mirror is drawn once into a texture; the ripple moves horizontal strips of it.
 */
export function addReflection(water: Phaser.GameObjects.Image, layers: Phaser.GameObjects.Image[], alpha = 0.4): Phaser.GameObjects.Container {
  const scene = water.scene;
  const key = water.texture.key;
  const waterline = findWaterline(water.width, water.height, (x, y) => scene.textures.getPixelAlpha(x, y, key) ?? 0);
  const height = water.height - waterline;
  const textureKey = `${key}-reflection`;
  if (!scene.textures.exists(textureKey)) {
    const rt = scene.make.renderTexture({ width: water.width, height }, false);
    for (const layer of layers) {
      const flipped = scene.make.image({ key: layer.texture.key, add: false }).setOrigin(0).setFlipY(true);
      rt.draw(flipped, 0, mirroredTop(waterline, layer.height) - waterline);
      flipped.destroy();
    }
    rt.saveTexture(textureKey);
  }
  const strips = Array.from({ length: Math.ceil(height / STRIP) }, (_, i) =>
    scene.add.image(0, 0, textureKey).setOrigin(0).setCrop(0, i * STRIP, water.width, STRIP));
  const container = scene.add.container(water.x, water.y + waterline, strips)
    .setAlpha(alpha)
    .setScrollFactor(water.scrollFactorX, water.scrollFactorY)
    .setDepth(water.depth + 0.01);
  container.setMask(water.createBitmapMask());
  const ripple = (time: number) => strips.forEach((s, i) => { s.x = rippleOffset(i, time); });
  scene.events.on(Phaser.Scenes.Events.UPDATE, ripple);
  container.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, ripple));
  return container;
}
