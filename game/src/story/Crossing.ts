import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { add404Void, addImageCut, addPixelStretch } from '../fx/anomaly';
import { sound } from '../fx/sound/Audio';
import { crashWindow } from '../ui/crashWindow';
import { CrossingSequence, tearLayout, TIMING, TIMING_404, type CrossingPhase } from './crossingSequence';
import { pullCurve } from './prologueFinale';

/** The prologue's window: the crash-OS voice, short (docs/03 "the 404"). */
export const NOT_FOUND_TEXT = '404: Hidden Garden not found.';

/** The hero as the 404 pulls him: his view position and the frame he is frozen in. */
export interface CrossingHero { x: number; y: number; texture: string; frame: string; flipX?: boolean; angle?: number }

export interface CrossingData {
  /** The scene that freezes while the window is up (default: the stage). */
  freeze?: string;
  /** Called on the cut: the story switches the stage here; the hero's damage animation finishes there. */
  onLand?: () => void;
  /** 'crash' (default): flash, cracks, "stopped responding". '404': the frame tears, the 404 window, the pull. */
  variant?: 'crash' | '404';
  /** 404: the hero, drawn over the torn frame and pulled into the void. */
  hero?: CrossingHero;
}

/** Act (J / X / Square), Enter or Space presses OK; so does a click. docs/02 controls. */
const OK_KEYS = ['J', 'ENTER', 'SPACE'];
const OK_PADS = [0, 2];
const FRAME_KEY = 'crossing-404-frame';

/** Runs the crossing over whatever scene is playing: flash, frozen cracked frame, the THD.exe window, cut. */
export class Crossing extends Phaser.Scene {
  private run!: CrossingSequence;
  private variant: 'crash' | '404' = 'crash';
  private last: CrossingPhase = 'idle';
  private flash!: Phaser.GameObjects.Rectangle;
  private dim!: Phaser.GameObjects.Rectangle;
  private cracks!: Phaser.GameObjects.Graphics;
  private dialog!: Phaser.GameObjects.Container;
  private black!: Phaser.GameObjects.Rectangle;
  // 404 only.
  private heroData?: CrossingHero;
  private hero?: Phaser.GameObjects.Sprite;
  private torn?: Phaser.GameObjects.Container;
  private tears: Phaser.GameObjects.GameObject[] = [];
  private frameImage?: Phaser.GameObjects.Image;
  private backdrop?: Phaser.GameObjects.Rectangle;
  private streaks?: Phaser.GameObjects.Graphics;
  private voidCentre = { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };

  constructor() { super('Crossing'); }

  create(data: CrossingData = {}): void {
    const frozen = data.freeze ?? 'Stage';
    this.variant = data.variant ?? 'crash';
    this.heroData = data.hero;
    this.last = 'idle';
    this.tears = [];
    this.torn = undefined;
    this.run = new CrossingSequence(() => {
      data.onLand?.();
      if (this.scene.isPaused(frozen)) this.scene.resume(frozen);
      this.scene.stop();
    }, this.variant === '404' ? TIMING_404 : TIMING);
    const is404 = this.variant === '404';
    if (is404) {
      this.backdrop = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x000000).setOrigin(0).setVisible(false);
      this.streaks = this.add.graphics().setDepth(5);
    }
    this.flash = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0xffffff, 0.85).setOrigin(0).setDepth(8);
    this.dim = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, 0.35).setOrigin(0).setVisible(false);
    this.cracks = this.drawCracks().setVisible(false);
    if (is404 && this.heroData) {
      const h = this.heroData;
      this.hero = this.add.sprite(h.x, h.y, h.texture, h.frame).setOrigin(0.5, 1).setFlipX(!!h.flipX)
        .setAngle(h.angle ?? 0).setDepth(6);
    }
    const { container, ok } = crashWindow(this, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 40, is404 ? NOT_FOUND_TEXT : undefined);
    this.dialog = container.setVisible(false).setDepth(10);
    this.black = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x000000).setOrigin(0).setVisible(false).setDepth(20);
    ok.on('pointerdown', () => this.run.confirm());
    for (const key of OK_KEYS) this.input.keyboard?.on(`keydown-${key}`, () => this.run.confirm());
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (OK_PADS.includes(button.index)) this.run.confirm();
    });
    this.run.start();
    this.events.once('freeze', () => { if (this.scene.isActive(frozen)) this.scene.pause(frozen); });
    this.events.once('dialog', () => sound.play('crash-ding'));
    this.scene.bringToTop();
  }

  update(_time: number, delta: number): void {
    const phase = this.run.update(delta);
    if (phase === 'freeze' || phase === 'dialog') this.events.emit('freeze');
    if (phase === 'dialog') this.events.emit('dialog');
    if (this.variant === '404') return this.update404(phase);
    this.flash.setVisible(phase === 'hit');
    this.dim.setVisible(phase === 'freeze' || phase === 'dialog');
    this.cracks.setVisible(phase === 'freeze' || phase === 'dialog');
    this.dialog.setVisible(phase === 'dialog');
    this.black.setVisible(phase === 'cut');
  }

  /** The prologue's 404: the frame tears around the hero, the window, then the pull into the void. */
  private update404(phase: CrossingPhase): void {
    const entered = phase !== this.last;
    this.last = phase;
    this.flash.setVisible(phase === 'hit').setAlpha(phase === 'hit' ? 0.9 * (1 - this.run.time / TIMING_404.hit) + 0.1 : 0);
    if (entered && phase === 'hit') sound.play('player-hurt');
    if (entered && phase === 'freeze') this.tearFrame();
    if (phase === 'freeze') {
      // The tears flicker in while the frame breaks; the hero jitters with them.
      const settle = this.run.time / TIMING_404.freeze;
      for (const item of this.tears) (item as Phaser.GameObjects.Image).setVisible(Math.random() < 0.35 + settle * 0.6);
      this.hero?.setX((this.heroData?.x ?? 0) + (Math.random() < 0.3 ? Phaser.Math.Between(-3, 3) : 0));
    }
    if (entered && phase === 'dialog') for (const item of this.tears) (item as Phaser.GameObjects.Image).setVisible(true);
    this.dialog.setVisible(phase === 'dialog');
    if (entered && phase === 'pull') this.beginPull();
    if (phase === 'pull') this.pull(this.run.pullProgress());
    this.black.setVisible(phase === 'cut' || phase === 'land' || phase === 'done');
  }

  /** The anomaly language over a snapshot of the frozen frame: cuts, a stretched column and the 404 void. */
  private tearFrame(): void {
    const hero = this.heroData ?? { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
    const layout = tearLayout(hero, { w: VIEW_WIDTH, h: VIEW_HEIGHT });
    this.voidCentre = { x: layout.void.x + layout.void.w / 2, y: layout.void.y + layout.void.h / 2 };
    // The snapshot must not contain our own hero: he is drawn on top of the torn frame.
    this.hero?.setVisible(false);
    this.game.renderer.snapshot(shot => {
      if (!(shot instanceof HTMLImageElement) || !this.scene.isActive()) return;
      if (this.textures.exists(FRAME_KEY)) this.textures.remove(FRAME_KEY);
      this.textures.addImage(FRAME_KEY, shot);
      const frame = this.add.image(0, 0, FRAME_KEY).setOrigin(0).setVisible(false);
      this.frameImage = frame;
      this.tears = [
        ...layout.cuts.flatMap(c => addImageCut(frame, c.area, c.shift, c.copies)),
        addPixelStretch(frame, layout.stretch, 6),
        add404Void(frame, layout.void),
      ];
      const { x, y } = this.voidCentre;
      this.torn = this.add.container(x, y).setDepth(1);
      for (const item of [frame, ...this.tears] as (Phaser.GameObjects.Image | Phaser.GameObjects.Graphics)[]) {
        item.setPosition(item.x - x, item.y - y);
        this.torn.add(item);
      }
      this.hero?.setVisible(true);
    });
  }

  private beginPull(): void {
    this.backdrop?.setVisible(true);
    this.frameImage?.setVisible(true);
    this.cameras.main.shake(TIMING_404.pull, 0.004);
    sound.play('fluid-absorb');
    this.time.delayedCall(TIMING_404.pull * 0.55, () => sound.play('chair-whoosh'));
    this.hero?.stop();
  }

  /** Everything spirals into the void: the torn frame collapses on it, the hero is dragged in and shrinks. */
  private pull(t: number): void {
    const { scale, spin, reach } = pullCurve(t);
    const { x: vx, y: vy } = this.voidCentre;
    this.torn?.setScale(Math.max(0.001, 1 - reach * 0.97)).setRotation(spin * 0.12);
    if (this.hero && this.heroData) {
      const dx = (this.heroData.x - vx) * (1 - reach);
      const dy = (this.heroData.y - 38 - vy) * (1 - reach);
      const a = spin * 0.5;
      this.hero.setOrigin(0.5, 0.5)
        .setPosition(vx + dx * Math.cos(a) - dy * Math.sin(a), vy + dx * Math.sin(a) + dy * Math.cos(a))
        .setRotation(spin)
        .setScale(Math.max(0.001, scale), Math.max(0.001, scale * (1 + reach * 0.8)));
    }
    // Streaks rushing into the void from the edges of the screen.
    const g = this.streaks;
    if (!g) return;
    g.clear();
    const rng = new Phaser.Math.RandomDataGenerator([String(Math.floor(t * 30))]);
    for (let i = 0; i < 26; i++) {
      const angle = rng.realInRange(0, Math.PI * 2);
      const far = rng.realInRange(380, 900) * (1 - reach * 0.6);
      const near = far * rng.realInRange(0.25, 0.6);
      g.lineStyle(rng.between(1, 3), i % 3 ? 0xe8e4dc : 0x9a9a9a, Math.min(1, reach * 1.6) * 0.8);
      g.lineBetween(vx + Math.cos(angle) * far, vy + Math.sin(angle) * far, vx + Math.cos(angle) * near, vy + Math.sin(angle) * near);
    }
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
