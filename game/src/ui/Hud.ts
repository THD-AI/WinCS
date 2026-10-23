import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { CellState, HudModel } from './hudModel';

const CELL = { x: 28, y: 28, w: 18, h: 32, gap: 8, cap: 4 };
const COLOURS = { full: 0x46d1b4, shine: 0xb8f5e6, cracked: 0xf2a24a, empty: 0x22313a, edge: 0x0d1418, text: '#e8e4dc' };
const BAR = { w: 560, h: 10, bottom: 44 };

/** Top-left battery cells and Jenny's boss bar, drawn over the stage (docs/06: HUD restraint). */
export class Hud extends Phaser.Scene {
  readonly model = new HudModel();
  private graphics!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'HUD', active: true }); }

  create(): void {
    this.graphics = this.add.graphics();
    this.bossName = this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - BAR.bottom - 22, '', {
      fontFamily: 'monospace', fontSize: '16px', color: COLOURS.text,
    }).setOrigin(0.5, 0);
    const stop = this.model.listen(gameEvents, () => this.time.now);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    // Dev builds: F8 runs the crossing anywhere (#51 verification).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F8', () => {
      if (!this.scene.isActive('Crossing')) this.scene.launch('Crossing');
    });
  }

  update(): void {
    const g = this.graphics.clear();
    this.model.cells(this.time.now).forEach((state, i) => this.drawCell(g, CELL.x + i * (CELL.w + CELL.gap), CELL.y, state));
    const boss = this.model.boss;
    this.bossName.setText(boss ? boss.name.toUpperCase() : '');
    if (boss) this.drawBossBar(g, this.model.bossFraction());
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
