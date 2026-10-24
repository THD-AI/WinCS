import type Phaser from 'phaser';
import { stageLayers, type StageManifest, type RegionState } from './manifest';
import { textureKey } from './assets';
import { gridBounds } from './camera';

/** z describes the art role; manifest list order describes alpha composition. */
export function drawStage(scene: Phaser.Scene, manifest: StageManifest, state: RegionState) {
  const images = stageLayers(manifest, state).map(layer => scene.add.image(layer.x, layer.y,
    textureKey(manifest.region, layer.file)).setOrigin(0).setScrollFactor(layer.scroll).setDepth(layer.order));
  const bounds = gridBounds(manifest);
  scene.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  return images;
}
