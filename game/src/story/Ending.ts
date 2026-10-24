import Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { addImageCut, addPixelStretch, add404Void } from '../fx/anomaly';
import { sound } from '../fx/sound/Audio';
import { crashWindow } from '../ui/crashWindow';
import { creditsText } from '../ui/creditsView';
import { createAnims, type AtlasAnim } from './atlases';
import { dexterScale, EndingSequence, type EndingPhase } from './endingSequence';

export const END_TEXT = 'To be continued.';

const ANIMS: AtlasAnim[] = [
  ['fx', 'black-fluid', 6, 0], ['dexter', 'hop', 4, -1], ['dexter-acts', 'absorb', 4, 0],
];
const STAGE = 'Stage';
const OK_KEYS = ['J', 'ENTER', 'SPACE'];
const OK_PADS = [0, 2];
/** Where Dexter lands, left of the pool, and how far he hops in from (game px). */
const DEXTER_OFFSET = -26;
const HOP_IN = 140;
/** Without a stage position (the dev key): the middle of the view, on a ground line. */
const FALLBACK: Position = { x: VIEW_WIDTH / 2, y: 600 };

/**
 * The end of the slice (docs/03 "The ending sequence", #58). Waits for lane B's `boss-defeated`, then
 * draws over the frozen stage: the pool under Jenny, Dexter absorbing it and growing to 46 px, the
 * glitch, the "to be continued" window, the credits, and back to the title.
 */
export class Ending extends Phaser.Scene {
  private run?: EndingSequence;
  private last: EndingPhase = 'idle';
  private at: Position = FALLBACK;
  private pool?: Phaser.GameObjects.Sprite;
  private dexter?: Phaser.GameObjects.Sprite;
  private glitch: Phaser.GameObjects.GameObject[] = [];

  constructor() { super({ key: 'Ending', active: true }); }

  create(): void {
    const stop = gameEvents.on('boss-defeated', ({ position }) => this.begin(position));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    // Dev builds: Shift + F8 runs the ending anywhere (#58 verification; F8 alone is the crossing).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F8', (event: KeyboardEvent) => { if (event.shiftKey) this.begin(); });
    for (const key of OK_KEYS) this.input.keyboard?.on(`keydown-${key}`, () => this.run?.confirm());
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (OK_PADS.includes(button.index)) this.run?.confirm();
    });
  }

  /** Start once, at Jenny's stage position turned into view pixels. */
  begin(position?: Position): void {
    if (this.run) return;
    this.at = position ? this.toView(position) : FALLBACK;
    if (this.scene.isActive(STAGE)) this.scene.pause(STAGE);
    createAnims(this, ANIMS);
    this.run = new EndingSequence(() => window.location.assign(window.location.pathname));
    this.run.start();
    this.scene.bringToTop();
  }

  update(_time: number, delta: number): void {
    if (!this.run) return;
    const phase = this.run.update(delta);
    if (phase !== this.last) this.enter(phase);
    this.last = phase;
    const t = this.run.progress();
    const d = this.dexter;
    if (phase === 'appear' && d) d.x = this.at.x + DEXTER_OFFSET - HOP_IN * (1 - t);
    if (phase === 'absorb' && this.pool) this.pool.setScale(1 - t, 1 - t * 0.5).setAlpha(1 - t * 0.6);
    if (d) d.setScale(dexterScale(phase, t));
    if (phase === 'leave' && d) d.x = this.at.x + DEXTER_OFFSET + (VIEW_WIDTH - this.at.x + 80) * t;
    // The tears flicker while the frame breaks, then hold still under the window.
    for (const item of this.glitch) (item as Phaser.GameObjects.Image).setVisible(phase !== 'glitch' || Math.random() < 0.7);
  }

  private enter(phase: EndingPhase): void {
    if (phase === 'leak') {
      this.pool = this.add.sprite(this.at.x, this.at.y, 'fx').setOrigin(0.5, 1);
      this.pool.play('fx:black-fluid');
    } else if (phase === 'appear') {
      this.dexter = this.add.sprite(this.at.x + DEXTER_OFFSET - HOP_IN, this.at.y, 'dexter').setOrigin(0.5, 1);
      this.dexter.play('dexter:hop');
    } else if (phase === 'absorb') {
      this.dexter?.play('dexter-acts:absorb');
      sound.play('fluid-absorb');
    } else if (phase === 'grow') {
      this.pool?.destroy();
      this.dexter?.stop().setTexture('dexter-acts', 'creepy-00');
    } else if (phase === 'leave') {
      this.dexter?.play('dexter:hop');
    } else if (phase === 'glitch') {
      this.dexter?.destroy();
      this.tearFrame();
    } else if (phase === 'dialog') {
      const { container, ok } = crashWindow(this, VIEW_WIDTH / 2, VIEW_HEIGHT / 2, END_TEXT);
      container.setDepth(10);
      ok.on('pointerdown', () => this.run?.confirm());
      sound.play('crash-ding');
    } else if (phase === 'credits') {
      this.children.removeAll(true);
      this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x101820).setOrigin(0);
      creditsText(this, 'Act – back to the title');
    }
  }

  /** The anomaly language over a snapshot of the frame: two cuts, a stretched row and a 404 void. */
  private tearFrame(): void {
    this.game.renderer.snapshot((shot) => {
      // The image arrives a frame or two later; under the window the torn frame stays.
      if (!(shot instanceof HTMLImageElement) || (this.last !== 'glitch' && this.last !== 'dialog')) return;
      if (this.textures.exists('ending-frame')) this.textures.remove('ending-frame');
      this.textures.addImage('ending-frame', shot);
      const frame = this.add.image(0, 0, 'ending-frame').setOrigin(0).setVisible(false);
      this.glitch = [
        ...addImageCut(frame, { x: 0, y: 180, w: VIEW_WIDTH, h: 60 }, 48),
        ...addImageCut(frame, { x: 0, y: 470, w: VIEW_WIDTH, h: 36 }, -64, 3),
        addPixelStretch(frame, { x: 760, y: 260, w: 220, h: 180 }, 4),
        add404Void(frame, { x: 180, y: 300, w: 200, h: 140 }),
      ];
    });
  }

  /** Stage pixels → view pixels through the stage's camera (no camera: unchanged). */
  private toView(p: Position): Position {
    const cam = this.scene.get(STAGE)?.cameras?.main;
    if (!cam) return p;
    return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom };
  }
}
