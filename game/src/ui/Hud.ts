import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { CellState, HudModel, MAX_CELLS } from './hudModel';
import { pocketMap } from './mapModel';
import { MENU_KEYS, MENU_PAD, toggleMap } from './PocketComputer';
import { UI_ATLAS, UI_LAYOUT, UiLayout } from './uiAtlas';

const CELL = { x: 28, y: 28, w: 18, h: 32, gap: 8, cap: 4 };
const COLOURS = { full: 0x46d1b4, shine: 0xb8f5e6, cracked: 0xf2a24a, empty: 0x22313a, edge: 0x0d1418, text: '#e8e4dc' };
const BAR = { w: 560, h: 10, bottom: 44 };
const CRACK_FRAMES = 4;
/** The boss bar sprite's hollow, as a share of its width; the fill tiles its middle third, not its end caps. */
const BAR_INNER = 0.9;

interface Art {
  cells: Phaser.GameObjects.Image[];
  bar: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.TileSprite;
  icon: Phaser.GameObjects.Image;
}

/** Top-left battery cells and Jenny's boss bar, drawn over the stage (docs/06: HUD restraint). */
export class Hud extends Phaser.Scene {
  readonly model = new HudModel();
  private graphics!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private art?: Art;

  constructor() { super({ key: 'HUD', active: true }); }

  preload(): void {
    this.load.atlas(UI_ATLAS, 'assets/ui/ui.png', 'assets/ui/ui.json');
    this.load.json(UI_LAYOUT, 'assets/ui/ui-layout.json');
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.bossName = this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - BAR.bottom - 22, '', {
      fontFamily: 'monospace', fontSize: '16px', color: COLOURS.text,
    }).setOrigin(0.5, 0);
    if (this.textures.exists(UI_ATLAS)) this.art = this.buildArt();
    const stop = this.model.listen(gameEvents, () => this.time.now);
    const stopMap = pocketMap.listen(gameEvents);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { stop(); stopMap(); });
    // The menu key opens the pocket computer's map once Dexter has handed it over (#69, #52).
    this.input.keyboard?.addCapture('TAB'); // Tab would move the browser's focus off the canvas
    for (const key of MENU_KEYS) this.input.keyboard?.on(`keydown-${key}`, () => toggleMap(this.scene));
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (button.index === MENU_PAD) toggleMap(this.scene);
    });
    // Dev builds: F4 hands over the pocket computer and marks the first rooms visited (#69 verification; F2 is the player's debug readout).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F4', () => {
      pocketMap.unlock();
      pocketMap.visit('hidden-garden', 'hg-0-0');
      pocketMap.visit('rusty-creek', 'rc-0-0');
      pocketMap.visit('rusty-creek', 'rc-1-0');
    });
    // Dev builds: F3 shows or hides Jenny's bar at 70 % (#54 will start it for real).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F3', () => {
      if (this.model.boss) return this.model.hideBoss();
      this.model.showBoss('Jenny', 10);
      this.model.setBossHealth(7);
    });
    // Dev builds: F8 runs the crossing anywhere (#51 verification).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F8', (event: KeyboardEvent) => {
      if (!event.shiftKey && !this.scene.isActive('Crossing')) this.scene.launch('Crossing');
    });
    // Dev builds: F9 opens the anomaly FX test chunk (#37 verification).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F9', () => {
      if (!this.scene.isActive('AnomalyTest')) this.scene.launch('AnomalyTest');
    });
    // Dev builds: F10 opens the atmosphere test chunk (#36 verification).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F10', () => {
      if (!this.scene.isActive('AtmosphereTest')) this.scene.launch('AtmosphereTest');
    });
  }

  update(): void {
    const g = this.graphics.clear();
    const now = this.time.now;
    const boss = this.model.boss;
    this.bossName.setText(boss ? boss.name.toUpperCase() : '');
    if (this.art) return this.updateArt(this.art, now);
    this.model.cells(now).forEach((state, i) => this.drawCell(g, CELL.x + i * (CELL.w + CELL.gap), CELL.y, state));
    if (boss) this.drawBossBar(g, this.model.bossFraction());
  }

  /** The sprites, built once; update only swaps frames and sizes. */
  private buildArt(): Art {
    const at = (this.cache.json.get(UI_LAYOUT) as UiLayout | undefined)?.cells ?? { x: CELL.x, y: CELL.y, pitch: 48 };
    const cells = Array.from({ length: MAX_CELLS }, (_, i) =>
      this.add.image(at.x + i * at.pitch, at.y, UI_ATLAS, 'cell-full').setOrigin(0));
    const bar = this.add.image(VIEW_WIDTH / 2, VIEW_HEIGHT - BAR.bottom, UI_ATLAS, 'boss-bar-frame').setOrigin(0.5, 1);
    // A frame for the fill's middle third: tiling the whole piece would repeat its end caps.
    const source = this.textures.getFrame(UI_ATLAS, 'boss-bar-fill');
    const third = Math.floor(source.width / 3);
    const atlas = this.textures.get(UI_ATLAS);
    if (!atlas.has('boss-bar-fill-mid')) atlas.add('boss-bar-fill-mid', source.sourceIndex, source.cutX + third, source.cutY, third, source.height);
    const fill = this.add.tileSprite(bar.x - (bar.width * BAR_INNER) / 2, bar.y - bar.height / 2, 0, source.height,
      UI_ATLAS, 'boss-bar-fill-mid').setOrigin(0, 0.5);
    bar.setDepth(1);
    const icon = this.add.image(bar.x - bar.width / 2 - 10, bar.y - bar.height / 2, UI_ATLAS, 'boss-icon').setOrigin(1, 0.5);
    this.bossName.setY(bar.y - bar.height - 22);
    return { cells, bar, fill, icon };
  }

  private updateArt(art: Art, now: number): void {
    this.model.cells(now).forEach((state, i) => {
      const crack = Math.min(CRACK_FRAMES - 1, Math.floor(this.model.crackProgress(i, now) * CRACK_FRAMES));
      art.cells[i].setFrame(state === 'full' ? 'cell-full' : state === 'empty' ? 'cell-empty' : `crack-${crack}`);
    });
    const boss = this.model.boss;
    for (const part of [art.bar, art.fill, art.icon]) part.setVisible(boss !== null);
    if (!boss) return;
    // A TileSprite needs setSize to change its tiled area (and treats width 0 as "frame width").
    const width = Math.round(art.bar.width * BAR_INNER * this.model.bossFraction());
    art.fill.setVisible(width > 0).setSize(Math.max(1, width), art.fill.height);
  }

  private drawCell(g: Phaser.GameObjects.Graphics, x: number, y: number, state: CellState): void {
    g.fillStyle(COLOURS.edge).fillRect(x - 2, y - 2, CELL.w + 4, CELL.h + 4);
    g.fillRect(x + CELL.w / 2 - CELL.cap, y - 2 - CELL.cap, CELL.cap * 2, CELL.cap);
    g.fillStyle(COLOURS.empty).fillRect(x, y, CELL.w, CELL.h);
    if (state === 'empty') return;
    const flash = state === 'cracked' && Math.floor(this.time.now / 80) % 2 === 0;
    g.fillStyle(state === 'full' ? COLOURS.full : flash ? 0xffffff : COLOURS.cracked).fillRect(x + 2, y + 2, CELL.w - 4, CELL.h - 4);
    if (state === 'full') g.fillStyle(COLOURS.shine).fillRect(x + 3, y + 3, 3, CELL.h - 10);
    else {
      g.lineStyle(2, COLOURS.edge);
      g.lineBetween(x + 3, y + 6, x + CELL.w - 6, y + 14).lineBetween(x + CELL.w - 6, y + 14, x + 5, y + 24);
    }
  }

  private drawBossBar(g: Phaser.GameObjects.Graphics, fraction: number): void {
    const x = (VIEW_WIDTH - BAR.w) / 2;
    const y = VIEW_HEIGHT - BAR.bottom;
    g.fillStyle(COLOURS.edge).fillRect(x - 3, y - 3, BAR.w + 6, BAR.h + 6);
    g.fillStyle(COLOURS.empty).fillRect(x, y, BAR.w, BAR.h);
    g.fillStyle(COLOURS.cracked).fillRect(x, y, Math.round(BAR.w * fraction), BAR.h);
  }
}
