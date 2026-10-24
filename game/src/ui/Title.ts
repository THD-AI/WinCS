import Phaser from 'phaser';
import type { StageData } from '../boot/contract';
import { PALETTE } from '../boot/LoadingView';
import { MENU_KEY } from '../boot/manifest';
import { pixelText, registerPixelFont } from '../boot/pixelFont';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { sound } from '../fx/sound/Audio';
import { gridBounds } from '../stage/camera';
import { drawStage } from '../stage/render';
import { MENU, moveSelection, SUBTITLE, TITLE } from './credits';
import { creditsText } from './creditsView';

const STAGE = 'Stage';
const HUD = 'HUD';
/** Over the UI, which sits over the stage art (depth bands in docs/15). */
const UI_DEPTH = 10_000;
/** The idle pan across the garden, one way, in ms. */
const PAN = 48_000;
const FADE_IN = 700;
/** Start: the menu dissolves while the stage starts underneath, then the title's garden dissolves into the stage's. */
const HAND_OVER = 900;

/**
 * The menu (first load only; Preload starts it with the region's StageData). The game's name over a live view
 * of the region's art – the title draws the stage itself and pans slowly across it, or shows the menu key art
 * (`assets/ui/menu-key.png`) when workstream 5 has drawn it. Start launches the stage underneath and dissolves
 * into it: the title's camera glides onto the stage camera while it fades, so the cut never goes black.
 * Up/Down or W/S chooses; Enter, Space or J (pad A/X) confirms; Esc (pad B) leaves the credits.
 */
export class Title extends Phaser.Scene {
  private choice = 0;
  private showingCredits = false;
  private leaving = false;
  private stageData!: StageData;
  private menu: Phaser.GameObjects.BitmapText[] = [];
  private titleLayer!: Phaser.GameObjects.Container;
  private creditsLayer!: Phaser.GameObjects.Container;
  private keyArt?: Phaser.GameObjects.Image;
  private pan?: Phaser.Tweens.Tween;

  constructor() { super('Title'); }

  create(data: StageData): void {
    this.stageData = data;
    this.choice = 0;
    this.showingCredits = false;
    this.leaving = false;
    registerPixelFont(this);
    if (this.scene.get(HUD)) this.scene.setVisible(false, HUD);

    this.drawGarden();
    this.drawOverlay();
    this.bindInput();
    this.select(0);
    this.cameras.main.fadeIn(FADE_IN, 12, 18, 24);
  }

  /** The live garden: the region's layers in this scene, with a slow pan; the key art over it when it exists. */
  private drawGarden(): void {
    const camera = this.cameras.main;
    try {
      drawStage(this, this.stageData.manifest, this.stageData.state, this.stageData.atmosphere);
      const bounds = gridBounds(this.stageData.manifest);
      const reach = Math.min(Math.max(0, bounds.width - VIEW_WIDTH), 1800);
      camera.setScroll(bounds.x, Math.max(bounds.y, bounds.y + bounds.height - VIEW_HEIGHT));
      camera.roundPixels = true;
      if (reach > 0) this.pan = this.tweens.add({ targets: camera, scrollX: bounds.x + reach, duration: PAN, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    } catch (error) { console.error('[title] no garden to draw', error); }
    if (this.textures.exists(MENU_KEY)) {
      const source = this.textures.get(MENU_KEY).getSourceImage();
      const scale = Math.max(VIEW_WIDTH / source.width, VIEW_HEIGHT / source.height);
      this.keyArt = this.add.image(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, MENU_KEY).setScale(scale).setScrollFactor(0).setDepth(UI_DEPTH - 1);
      // The key art and the live garden take turns: the painting dissolves into the panning stage and back.
      this.tweens.add({ targets: this.keyArt, alpha: 0, delay: 9000, duration: 2600, hold: 16_000, yoyo: true,
        repeat: -1, repeatDelay: 9000, ease: 'Sine.easeInOut' });
    }
  }

  private drawOverlay(): void {
    // Night bands behind the words, so they read over bright autumn leaves.
    const shade = this.add.graphics();
    shade.fillGradientStyle(PALETTE.night, PALETTE.night, PALETTE.night, PALETTE.night, 0.82, 0.82, 0, 0).fillRect(0, 0, VIEW_WIDTH, 300);
    shade.fillGradientStyle(PALETTE.night, PALETTE.night, PALETTE.night, PALETTE.night, 0, 0, 0.85, 0.85).fillRect(0, 380, VIEW_WIDTH, VIEW_HEIGHT - 380);
    const cx = VIEW_WIDTH / 2;
    const title = pixelText(this, cx, 120, TITLE, 10, PALETTE.cream).setOrigin(0.5).setDropShadow(1, 1, PALETTE.ink, 1);
    const subtitle = pixelText(this, cx - 12, 206, SUBTITLE, 3, PALETTE.rust).setOrigin(0.5).setDropShadow(1, 1, PALETTE.ink, 1);
    const cursor = pixelText(this, subtitle.x + subtitle.displayWidth / 2 + 6, 206, '~', 3, PALETTE.rust).setOrigin(0, 0.5).setDropShadow(1, 1, PALETTE.ink, 1);
    this.time.addEvent({ delay: 530, loop: true, callback: () => cursor.setVisible(!cursor.visible) });
    this.menu = MENU.map((item, i) => pixelText(this, cx, 500 + i * 56, item, 4, PALETTE.cream).setOrigin(0.5).setDropShadow(1, 1, PALETTE.ink, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.select(i))
      .on('pointerdown', () => { this.select(i); this.confirm(); }));
    const hint = pixelText(this, cx, VIEW_HEIGHT - 40, 'ARROWS / WASD  CHOOSE     ENTER / SPACE / J  SELECT', 2, PALETTE.cream).setOrigin(0.5).setDropShadow(1, 1, PALETTE.ink, 1);
    this.titleLayer = this.add.container(0, 0, [shade, title, subtitle, cursor, ...this.menu, hint])
      .setScrollFactor(0).setDepth(UI_DEPTH);
    const veil = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, PALETTE.night, 0.88).setOrigin(0);
    this.creditsLayer = this.add.container(0, 0, [veil, ...creditsText(this, 'Act / Esc – back')])
      .setScrollFactor(0).setDepth(UI_DEPTH + 1).setVisible(false);
  }

  private bindInput(): void {
    const keys = this.input.keyboard;
    keys?.addCapture('UP,DOWN,SPACE'); // these would scroll the page under the canvas
    for (const key of ['UP', 'W']) keys?.on(`keydown-${key}`, () => this.select(moveSelection(this.choice, -1)));
    for (const key of ['DOWN', 'S']) keys?.on(`keydown-${key}`, () => this.select(moveSelection(this.choice, 1)));
    for (const key of ['J', 'ENTER', 'SPACE']) keys?.on(`keydown-${key}`, () => this.confirm());
    keys?.on('keydown-ESC', () => this.showCredits(false));
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (button.index === 12) this.select(moveSelection(this.choice, -1));
      else if (button.index === 13) this.select(moveSelection(this.choice, 1));
      else if (button.index === 0 || button.index === 2 || button.index === 9) this.confirm();
      else if (button.index === 1) this.showCredits(false);
    });
    // Left stick: one step per push.
    let held = 0;
    this.events.on(Phaser.Scenes.Events.UPDATE, () => {
      const y = this.input.gamepad?.pad1?.leftStick.y ?? 0;
      const dir = y < -0.5 ? -1 : y > 0.5 ? 1 : 0;
      if (dir && dir !== held && !this.showingCredits) this.select(moveSelection(this.choice, dir));
      held = dir;
    });
  }

  private select(index: number): void {
    if (this.leaving) return;
    this.choice = index;
    this.menu.forEach((text, i) => text.setTint(i === index ? PALETTE.teal : PALETTE.cream)
      .setText(i === index ? `> ${MENU[i].toUpperCase()} <` : MENU[i].toUpperCase()));
  }

  private confirm(): void {
    if (this.leaving) return;
    if (this.showingCredits) return this.showCredits(false);
    if (MENU[this.choice] === 'Credits') return this.showCredits(true);
    this.start();
  }

  private showCredits(on: boolean): void {
    if (this.leaving) return;
    this.showingCredits = on;
    this.titleLayer.setVisible(!on);
    this.creditsLayer.setVisible(on);
  }

  /** Start: the stage begins underneath, this scene's garden glides onto its camera and dissolves away. */
  private start(): void {
    this.leaving = true;
    sound.loop('hidden-garden'); // the slice opens in the prologue garden; the key press unlocked audio
    if (this.keyArt) this.tweens.killTweensOf(this.keyArt);
    this.tweens.add({ targets: [this.titleLayer, this.keyArt].filter(Boolean), alpha: 0, duration: 450, ease: 'Quad.easeOut' });
    this.pan?.stop();
    this.scene.launch(STAGE, this.stageData);
    this.scene.bringToTop();
    const stage = this.scene.get(STAGE);
    const camera = this.cameras.main;
    const glide = () => {
      const target = stage.cameras?.main;
      if (!target) return;
      camera.setScroll(Phaser.Math.Linear(camera.scrollX, target.scrollX, 0.12), Phaser.Math.Linear(camera.scrollY, target.scrollY, 0.12));
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, glide);
    this.tweens.add({
      targets: camera, alpha: 0, delay: 250, duration: HAND_OVER, ease: 'Sine.easeInOut',
      onComplete: () => {
        if (this.scene.get(HUD)) this.scene.setVisible(true, HUD);
        this.scene.stop();
      },
    });
  }
}
