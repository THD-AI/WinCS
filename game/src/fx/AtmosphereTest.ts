import Phaser from 'phaser';
import { addLeaves, addReflection, blurForeground } from './atmosphere';
import { StageState } from './atmosphereLayout';

const BASE = 'assets/stages/rusty-creek/';
/** rc-0-0 in draw order (stage.json), with each layer's scroll factor. */
const LAYERS = [
  { id: '01-distance', scroll: 0.2 },
  { id: '03-bank', scroll: 1 },
  { id: '02-supports', scroll: 1 },
  { id: '04-water', scroll: 1 },
  { id: '05-traversal', scroll: 1 },
  { id: '06-near-rails', scroll: 1.1 },
  { id: '07-foliage', scroll: 1.15 },
];

/**
 * Dev only (#36 verification): the first Rusty Creek chunk with the blur, leaves and reflection.
 * F10 opens it from the HUD; V shows and hides the atmosphere; A switches clean / anomaly leaves; arrows pan; Esc closes.
 */
export class AtmosphereTest extends Phaser.Scene {
  private state: StageState = 'clean';
  private leaves?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() { super('AtmosphereTest'); }

  preload(): void {
    for (const layer of LAYERS) this.load.image(`rc-test-${layer.id}`, `${BASE}${layer.id}-left.png`);
  }

  create(): void {
    const images = LAYERS.map((l, i) => this.add.image(0, 0, `rc-test-${l.id}`).setOrigin(0).setScrollFactor(l.scroll, 1).setDepth(i));
    const byId = (id: string) => images[LAYERS.findIndex((l) => l.id === id)];
    const mirrored = images.filter((_, i) => LAYERS[i].id !== '04-water' && LAYERS[i].id !== '07-foliage');
    const reflection = addReflection(byId('04-water'), mirrored);
    const foliage = byId('07-foliage');
    let on = true;
    blurForeground(foliage);
    this.leaves = addLeaves(this, this.state);
    this.cameras.main.setBounds(0, 0, foliage.width, foliage.height);

    const keys = this.input.keyboard;
    keys?.on('keydown-V', () => {
      on = !on;
      reflection.setVisible(on);
      this.leaves?.setVisible(on);
      if (on) blurForeground(foliage); else foliage.preFX?.clear();
    });
    keys?.on('keydown-A', () => {
      this.state = this.state === 'clean' ? 'anomaly' : 'clean';
      this.leaves?.destroy();
      this.leaves = addLeaves(this, this.state).setVisible(on);
    });
    keys?.on('keydown-ESC', () => this.scene.stop());
    const arrows = keys?.createCursorKeys();
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, delta: number) => {
      if (arrows?.left.isDown) this.cameras.main.scrollX -= delta * 0.6;
      if (arrows?.right.isDown) this.cameras.main.scrollX += delta * 0.6;
    });
    this.scene.bringToTop();
  }
}
