import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { UI_ATLAS_KEY, UI_LAYOUT_KEY } from './manifest';
import { pixelSafe, pixelText } from './pixelFont';
import { formatBytes, type Summary } from './progress';

/** The slice's palette (style master, HUD direction): night ink, cream, phosphor green, teal charge, rust. */
export const PALETTE = {
  night: 0x0c1218, ink: 0x101820, cream: 0xe8e4dc, dim: 0x7d8a90, teal: 0x46d1b4,
  phosphor: 0x39ff6a, phosphorDim: 0x1c8a3a, screen: 0x041006, rust: 0xf2a24a, red: 0xe0503a,
} as const;

const CELLS = 12;
const LOG_LINES = 11;
const FRAME = { w: 560, h: 365, screen: [45, 71, 456, 261] as [number, number, number, number] };

/**
 * The loading screen: the pocket computer's rusted case (approved UI atlas) with a boot log on its CRT, a row of
 * battery cells charging with real progress, and the window title that every player of the 90s knows –
 * "(Not Responding)" – until the last file lands. Draws in code when the UI atlas itself is missing.
 */
export class LoadingView {
  private log: { text: string; tint: number }[] = [];
  private logText: Phaser.GameObjects.BitmapText[] = [];
  private cells: Phaser.GameObjects.Image[] = [];
  private bar?: Phaser.GameObjects.Graphics;
  private stats: Phaser.GameObjects.BitmapText;
  private status: Phaser.GameObjects.BitmapText;
  private hint: Phaser.GameObjects.BitmapText;
  private screen: { x: number; y: number; w: number; h: number };
  private cellsAt: { x: number; y: number; pitch: number };
  private done = false;

  constructor(private scene: Phaser.Scene, region: string) {
    const add = scene.add;
    add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, PALETTE.night).setOrigin(0);
    // Faint scanlines over the whole view: the screen is the game.
    const lines = add.graphics().setAlpha(0.18);
    for (let y = 0; y < VIEW_HEIGHT; y += 4) lines.fillStyle(0x000000).fillRect(0, y, VIEW_WIDTH, 2);

    const art = scene.textures.exists(UI_ATLAS_KEY) && scene.textures.get(UI_ATLAS_KEY).has('pocket-frame');
    const layout = scene.cache.json.get(UI_LAYOUT_KEY) as { 'pocket-frame'?: { size: [number, number]; screen: [number, number, number, number] } } | undefined;
    const frame = layout?.['pocket-frame'] ?? FRAME;
    const [fw, fh] = 'size' in frame ? frame.size : [FRAME.w, FRAME.h];
    const fx = Math.round((VIEW_WIDTH - fw) / 2), fy = 150;
    const [sx, sy, sw, sh] = frame.screen;
    this.screen = { x: fx + sx, y: fy + sy, w: sw, h: sh };
    const glass = add.graphics();
    glass.fillStyle(PALETTE.screen).fillRect(this.screen.x, this.screen.y, sw, sh);
    if (art) {
      add.image(fx, fy, UI_ATLAS_KEY, 'pocket-frame').setOrigin(0);
    } else {
      glass.lineStyle(10, 0x6f767d).strokeRect(this.screen.x - 14, this.screen.y - 14, sw + 28, sh + 28);
    }
    const scan = add.graphics().setAlpha(0.35);
    for (let y = this.screen.y; y < this.screen.y + sh; y += 3) scan.fillStyle(0x000000).fillRect(this.screen.x, y, sw, 1);

    // The window title above the case: the crash-OS joke is the game's identity.
    pixelText(scene, VIEW_WIDTH / 2, 64, 'DEGGSTER.EXE', 5, PALETTE.cream).setOrigin(0.5);
    this.status = pixelText(scene, VIEW_WIDTH / 2, 112, '(NOT RESPONDING)', 2, PALETTE.rust).setOrigin(0.5);

    for (let i = 0; i < LOG_LINES; i++) {
      this.logText.push(pixelText(scene, this.screen.x + 14, this.screen.y + 14 + i * 20, '', 2, PALETTE.phosphor));
    }
    this.cellsAt = { x: Math.round(VIEW_WIDTH / 2 - (CELLS * 40) / 2 + 3), y: fy + fh + 26, pitch: 40 };
    if (art && scene.textures.get(UI_ATLAS_KEY).has('cell-empty')) {
      for (let i = 0; i < CELLS; i++) this.cells.push(add.image(this.cellsAt.x + i * this.cellsAt.pitch, this.cellsAt.y, UI_ATLAS_KEY, 'cell-empty').setOrigin(0));
    } else this.bar = add.graphics();
    this.stats = pixelText(scene, VIEW_WIDTH / 2, this.cellsAt.y + 70, '', 2, PALETTE.dim).setOrigin(0.5, 0);
    this.hint = pixelText(scene, VIEW_WIDTH / 2, this.cellsAt.y + 96, '', 2, PALETTE.cream).setOrigin(0.5, 0);
    this.line(`C:\\> DEGGSTER.EXE /REGION=${region}`, PALETTE.cream);
  }

  /** Append a boot-log line (keeps the last LOG_LINES). */
  line(text: string, tint: number = PALETTE.phosphor): void {
    const max = Math.floor((this.screen.w - 28) / 12);
    const safe = pixelSafe(text);
    this.log.push({ text: safe.length > max ? `${safe.slice(0, max - 3)}...` : safe, tint });
    this.log = this.log.slice(-LOG_LINES);
    this.logText.forEach((t, i) => { const row = this.log[i]; t.setText(row?.text ?? '').setTint(row?.tint ?? PALETTE.phosphor); });
  }

  /** Redraw progress: cells charge with the fraction, the cell being filled flickers. */
  update(summary: Summary, time: number): void {
    const filled = summary.fraction * CELLS;
    const flicker = Math.floor(time / 120) % 2 === 0;
    this.cells.forEach((cell, i) => cell.setFrame(i < Math.floor(filled) ? 'cell-full'
      : i === Math.floor(filled) && !this.done && flicker ? 'crack-1' : 'cell-empty'));
    if (this.bar) {
      const w = CELLS * this.cellsAt.pitch - 6;
      this.bar.clear().fillStyle(PALETTE.ink).fillRect(this.cellsAt.x, this.cellsAt.y, w, 40)
        .fillStyle(PALETTE.teal).fillRect(this.cellsAt.x, this.cellsAt.y, Math.round(w * summary.fraction), 40);
    }
    const percent = Math.floor(summary.fraction * 100);
    this.stats.setText(pixelSafe(`${summary.done}/${summary.files} FILES  ${formatBytes(summary.bytes)}  ${percent}%`));
    if (!this.done) this.status.setVisible(Math.floor(time / 700) % 2 === 0 || summary.errors.length > 0);
  }

  /** The last file landed: the window responds again. */
  finish(): void {
    this.done = true;
    this.status.setText(pixelSafe('(RESPONDING)')).setTint(PALETTE.teal).setVisible(true);
    this.line('DEGGSTER.EXE IS NOW RESPONDING.', PALETTE.cream);
    this.hint.setText('');
  }

  /** Failed required files: list them and offer Retry / Continue. */
  showErrors(errors: { url: string; reason: string }[], countdown?: number): void {
    this.status.setText(pixelSafe(`(NOT RESPONDING) - ${errors.length} FILE${errors.length === 1 ? '' : 'S'} FAILED`)).setTint(PALETTE.red).setVisible(true);
    this.hint.setText(pixelSafe(`[R] RETRY   [C] CONTINUE WITHOUT THEM${countdown !== undefined ? ` (${countdown})` : ''}`));
  }

  clearErrors(): void {
    this.status.setText('(NOT RESPONDING)').setTint(PALETTE.rust);
    this.hint.setText('');
  }
}
