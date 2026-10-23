import type Phaser from 'phaser';
import { stageLayers, type StageManifest, type RegionState } from './manifest';
import { textureKey } from './assets';

/** z describes the art role; manifest list order describes alpha composition. */
export function drawStage(scene: Phaser.Scene, manifest: StageManifest, state: RegionState) {
  const images = stageLayers(manifest, state).map(layer => scene.add.image(layer.x, layer.y,
    textureKey(manifest.region, layer.file)).setOrigin(0).setScrollFactor(layer.scroll).setDepth(layer.order));
  const xs = manifest.chunks.map(c => c.x * manifest.chunkSize[0]);
  const ys = manifest.chunks.map(c => c.y * manifest.chunkSize[1]);
  scene.cameras.main.setBounds(Math.min(...xs), Math.min(...ys),
    Math.max(...xs) - Math.min(...xs) + manifest.chunkSize[0],
    Math.max(...ys) - Math.min(...ys) + manifest.chunkSize[1]);
  return images;
}
