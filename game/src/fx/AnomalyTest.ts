import Phaser from 'phaser';
import { add404Void, addImageCut, addPixelStretch } from './anomaly';

const BASE = 'assets/stages/rusty-creek/';
const LAYERS = [
  { key: 'rc-test-distance', file: 'rc-0-1.01-far.png', scroll: 1 },
  { key: 'rc-test-traversal', file: 'rc-0-1.05-play.png', scroll: 1 },
];

/**
 * Dev only (#37 verification): the creek path's first chunk (rc-0-1) with each anomaly effect on it.
 * F9 opens it from the HUD; V shows and hides the effects; arrows pan; Esc closes.
 */
export class AnomalyTest extends Phaser.Scene {
  constructor() { super('AnomalyTest'); }

  preload(): void {
    for (const layer of LAYERS) this.load.image(layer.key, BASE + layer.file);
  }

  create(): void {
    const [distance, traversal] = LAYERS.map((l, i) => this.add.image(0, 0, l.key).setOrigin(0).setScrollFactor(l.scroll, 1).setDepth(i));
    const effects: (Phaser.GameObjects.Image | Phaser.GameObjects.Graphics)[] = [
      ...addImageCut(traversal, { x: 420, y: 330, w: 130, h: 200 }, 44, 3),
      addPixelStretch(traversal, { x: 640, y: 180, w: 90, h: 260 }, 0),
      addPixelStretch(distance, { x: 300, y: 120, w: 60, h: 160 }, 20),
      add404Void(traversal, { x: 900, y: 140, w: 200, h: 170 }),
    ];
    this.cameras.main.setBounds(0, 0, traversal.width, traversal.height);
    const keys = this.input.keyboard;
    keys?.on('keydown-V', () => effects.forEach((e) => e.setVisible(!e.visible)));
    keys?.on('keydown-ESC', () => this.scene.stop());
    const arrows = keys?.createCursorKeys();
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      if (arrows?.left.isDown) this.cameras.main.scrollX -= delta * 0.6;
      if (arrows?.right.isDown) this.cameras.main.scrollX += delta * 0.6;
    });
    this.scene.bringToTop();
  }
}
