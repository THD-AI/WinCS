import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { CREDITS, MENU, moveSelection, SUBTITLE, TITLE } from './credits';

const C = { bg: 0x101820, text: '#e8e4dc', dim: '#7d8a90', pick: '#46d1b4' };
const FONT = 'monospace';
/** Scenes the title holds back until Start: the stage freezes, the HUD hides. */
const STAGE = 'Stage';
const HUD = 'HUD';

/** Title and credits over the stage. Up/Down chooses; Act (J), Enter or Space confirms; Esc leaves the credits. */
export class Title extends Phaser.Scene {
  private choice = 0;
  private showingCredits = false;
  private menu: Phaser.GameObjects.Text[] = [];
  private titleLayer!: Phaser.GameObjects.Container;
  private creditsLayer!: Phaser.GameObjects.Container;

  constructor() { super({ key: 'Title', active: true }); }

  create(): void {
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, C.bg).setOrigin(0);
    const title = this.add.text(VIEW_WIDTH / 2, 230, TITLE, { fontFamily: FONT, fontSize: '64px', color: C.text, fontStyle: 'bold' }).setOrigin(0.5);
    const subtitle = this.add.text(VIEW_WIDTH / 2, 290, SUBTITLE, { fontFamily: FONT, fontSize: '20px', color: C.dim }).setOrigin(0.5);
    this.menu = MENU.map((item, i) => this.add.text(VIEW_WIDTH / 2, 420 + i * 44, item, { fontFamily: FONT, fontSize: '28px', color: C.text })
      .setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.select(i))
      .on('pointerdown', () => { this.select(i); this.confirm(); }));
    this.titleLayer = this.add.container(0, 0, [title, subtitle, ...this.menu]);
    this.creditsLayer = this.add.container(0, 0, this.creditsText()).setVisible(false);
    const keys = this.input.keyboard;
    keys?.addCapture('UP,DOWN,SPACE');  // these would scroll the page under the canvas
    keys?.on('keydown-UP', () => this.select(moveSelection(this.choice, -1)));
    keys?.on('keydown-W', () => this.select(moveSelection(this.choice, -1)));
    keys?.on('keydown-DOWN', () => this.select(moveSelection(this.choice, 1)));
    keys?.on('keydown-S', () => this.select(moveSelection(this.choice, 1)));
    for (const key of ['J', 'ENTER', 'SPACE']) keys?.on(`keydown-${key}`, () => this.confirm());
    keys?.on('keydown-ESC', () => this.showCredits(false));
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (button.index === 12) this.select(moveSelection(this.choice, -1));
      else if (button.index === 13) this.select(moveSelection(this.choice, 1));
      else if (button.index === 0 || button.index === 2) this.confirm();
      else if (button.index === 1) this.showCredits(false);
    });
    this.select(0);
  }

  update(): void {
    // Hold the game back while the title is up: the stage starts after preload, so pause it once it runs.
    if (this.scene.isActive(STAGE)) this.scene.pause(STAGE);
    if (this.scene.isVisible(HUD)) this.scene.setVisible(false, HUD);
    this.scene.bringToTop();
  }

  private select(index: number): void {
    this.choice = index;
    this.menu.forEach((text, i) => text.setColor(i === index ? C.pick : C.text).setText(i === index ? `> ${MENU[i]} <` : MENU[i]));
  }

  private confirm(): void {
    if (this.showingCredits) return this.showCredits(false);
    if (MENU[this.choice] === 'Credits') return this.showCredits(true);
    if (this.scene.isPaused(STAGE)) this.scene.resume(STAGE);
    this.scene.setVisible(true, HUD);
    this.scene.stop();
  }

  private showCredits(on: boolean): void {
    this.showingCredits = on;
    this.titleLayer.setVisible(!on);
    this.creditsLayer.setVisible(on);
  }

  private creditsText(): Phaser.GameObjects.Text[] {
    const out: Phaser.GameObjects.Text[] = [];
    let y = 110;
    for (const section of CREDITS) {
      out.push(this.add.text(VIEW_WIDTH / 2, y, section.heading, { fontFamily: FONT, fontSize: '24px', color: C.pick }).setOrigin(0.5));
      y += 36;
      for (const line of section.lines) {
        out.push(this.add.text(VIEW_WIDTH / 2, y, line, { fontFamily: FONT, fontSize: '18px', color: C.text }).setOrigin(0.5));
        y += 26;
      }
      y += 22;
    }
    out.push(this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - 50, 'Act / Esc – back', { fontFamily: FONT, fontSize: '16px', color: C.dim }).setOrigin(0.5));
    return out;
  }
}
