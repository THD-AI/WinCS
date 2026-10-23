import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { pocketMap, REGION_ORDER, Room, StageManifest } from './mapModel';

const C = { case: 0xb9bec4, caseDark: 0x6f767d, screen: 0x041006, room: 0x39ff6a, roomEdge: 0x1c8a3a, scan: 0x000000, text: '#39ff6a' };
const SCREEN = { w: 760, h: 440 };
const CELL = { w: 132, h: 44, gap: 10 };
const FONT = { fontFamily: 'monospace', fontSize: '16px', color: C.text };
const STAGE = 'Stage';
/** Menu: Tab or Esc on the keyboard, Start on a pad (docs/02 controls). */
export const MENU_KEYS = ['TAB', 'ESC'];
export const MENU_PAD = 9;

/** The menu key: opens the map once you have the pocket computer, closes it if open. One owner (the HUD) calls this. */
export function toggleMap(scenes: Phaser.Scenes.ScenePlugin): void {
  if (scenes.isActive('PocketComputer')) scenes.stop('PocketComputer');
  else if (pocketMap.unlocked) scenes.launch('PocketComputer');
}

/**
 * The pocket computer's map (#69): a green-on-black CRT screen in the aluminium case. Rooms are stage chunks,
 * drawn only once visited; the room you are in blinks. The stage pauses while it is open.
 */
export class PocketComputer extends Phaser.Scene {
  constructor() { super('PocketComputer'); }

  preload(): void {
    for (const region of REGION_ORDER) this.load.json(`map-stage-${region}`, `assets/stages/${region}/stage.json`);
  }

  create(): void {
    for (const region of REGION_ORDER) {
      const manifest = this.cache.json.get(`map-stage-${region}`) as StageManifest | undefined;
      if (manifest) pocketMap.addRegion(manifest);
    }
    if (this.scene.isActive(STAGE)) this.scene.pause(STAGE);

    const x = (VIEW_WIDTH - SCREEN.w) / 2;
    const y = (VIEW_HEIGHT - SCREEN.h) / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55).fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    g.fillStyle(C.caseDark).fillRoundedRect(x - 28, y - 28, SCREEN.w + 56, SCREEN.h + 56, 18);
    g.fillStyle(C.case).fillRoundedRect(x - 24, y - 24, SCREEN.w + 48, SCREEN.h + 48, 16);
    g.fillStyle(C.screen).fillRect(x, y, SCREEN.w, SCREEN.h);
    this.add.text(x + 20, y + 14, 'MAP', FONT);

    this.drawRooms(x + 20, y + 52, pocketMap.rooms());

    // Static scanlines over the whole screen: the CRT look without a shader.
    const scan = this.add.graphics();
    scan.fillStyle(C.scan, 0.28);
    for (let row = y; row < y + SCREEN.h; row += 3) scan.fillRect(x, row, SCREEN.w, 1);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene.isPaused(STAGE)) this.scene.resume(STAGE);
    });
    this.scene.bringToTop();
  }

  /** One row per region (only regions with a visited room get a label), chunks placed on their grid. */
  private drawRooms(left: number, top: number, rooms: Room[]): void {
    const g = this.add.graphics();
    let y = top;
    for (const region of new Set(rooms.map((r) => r.region))) {
      const inRegion = rooms.filter((r) => r.region === region);
      const seen = inRegion.filter((r) => r.visited);
      if (seen.length === 0) continue;
      this.add.text(left, y, region.split('-').join(' ').toUpperCase(), { ...FONT, fontSize: '13px' });
      y += 22;
      const rows = Math.max(...inRegion.map((r) => r.gy)) + 1;
      for (const room of seen) {
        const rx = left + room.gx * (CELL.w + CELL.gap);
        const ry = y + room.gy * (CELL.h + CELL.gap);
        g.fillStyle(C.roomEdge).fillRect(rx, ry, CELL.w, CELL.h);
        g.fillStyle(C.room, 0.85).fillRect(rx + 3, ry + 3, CELL.w - 6, CELL.h - 6);
        if (room.current) {
          const dot = this.add.rectangle(rx + CELL.w / 2, ry + CELL.h / 2, 10, 10, C.screen);
          this.tweens.add({ targets: dot, alpha: 0, duration: 380, yoyo: true, repeat: -1 });
        }
      }
      y += rows * (CELL.h + CELL.gap) + 18;
    }
  }
}
