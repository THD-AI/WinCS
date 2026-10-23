import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { crashWindow } from '../ui/crashWindow';
import { CrossingSequence } from './crossingSequence';

export interface CrossingData {
  /** The scene that freezes while the window is up (default: the stage). */
  freeze?: string;
  /** Called on the cut: the story switches the stage here; the hero's damage animation finishes there. */
  onLand?: () => void;
}

/** Act (J / X / Square), Enter or Space presses OK; so does a click. docs/02 controls. */
const OK_KEYS = ['J', 'ENTER', 'SPACE'];
const OK_PADS = [0, 2];

/** Runs the crossing over whatever scene is playing: flash, frozen cracked frame, the THD.exe window, cut. */
export class Crossing extends Phaser.Scene {
  private run!: CrossingSequence;
  private flash!: Phaser.GameObjects.Rectangle;
  private dim!: Phaser.GameObjects.Rectangle;
  private cracks!: Phaser.GameObjects.Graphics;
  private dialog!: Phaser.GameObjects.Container;
  private black!: Phaser.GameObjects.Rectangle;

  constructor() { super('Crossing'); }

  create(data: CrossingData = {}): void {
    const frozen = data.freeze ?? 'Stage';
    this.run = new CrossingSequence(() => {
      data.onLand?.();
      if (this.scene.isPaused(frozen)) this.scene.resume(frozen);
      this.scene.stop();
    });
    this.flash = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0xffffff, 0.85).setOrigin(0);
    this.dim = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, 0.35).setOrigin(0).setVisible(false);
    this.cracks = this.drawCracks().setVisible(false);
    const { container, ok } = crashWindow(this, VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
    this.dialog = container.setVisible(false);
    this.black = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x000000).setOrigin(0).setVisible(false);
    ok.on('pointerdown', () => this.run.confirm());
    for (const key of OK_KEYS) this.input.keyboard?.on(`keydown-${key}`, () => this.run.confirm());
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (OK_PADS.includes(button.index)) this.run.confirm();
    });
    this.run.start();
    this.events.once('freeze', () => { if (this.scene.isActive(frozen)) this.scene.pause(frozen); });
    this.scene.bringToTop();
  }

  update(_time: number, delta: number): void {
    const phase = this.run.update(delta);
    if (phase === 'freeze' || phase === 'dialog') this.events.emit('freeze');
    this.flash.setVisible(phase === 'hit');
    this.dim.setVisible(phase === 'freeze' || phase === 'dialog');
    this.cracks.setVisible(phase === 'freeze' || phase === 'dialog');
    this.dialog.setVisible(phase === 'dialog');
    this.black.setVisible(phase === 'cut');
  }

  /** A few pixel cracks radiating from the centre over the frozen picture. */
  private drawCracks(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().lineStyle(2, 0xe8e4dc, 0.9);
    const rng = new Phaser.Math.RandomDataGenerator(['thd.exe']);
    for (let i = 0; i < 9; i++) {
      let x = VIEW_WIDTH / 2 + rng.between(-40, 40);
      let y = VIEW_HEIGHT / 2 + rng.between(-30, 30);
      const angle = (i / 9) * Math.PI * 2 + rng.realInRange(-0.3, 0.3);
      for (let step = 0; step < 6; step++) {
        const length = rng.between(40, 90);
        const nx = x + Math.cos(angle + rng.realInRange(-0.5, 0.5)) * length;
        const ny = y + Math.sin(angle + rng.realInRange(-0.5, 0.5)) * length;
        g.lineBetween(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny));
        x = nx;
        y = ny;
      }
    }
    return g;
  }
}
