import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { layoutMap, MapLayout } from './mapLayout';
import { pocketMap, REGION_ORDER, StageManifest } from './mapModel';
import { UI_ATLAS, UI_LAYOUT, UiLayout } from './uiAtlas';

const C = { case: 0xb9bec4, caseDark: 0x6f767d, screen: 0x041006, room: 0x39ff6a, roomEdge: 0x1c8a3a, scan: 0x000000 };
/** Placeholder sizes, used only without the UI atlas. */
const SCREEN = { w: 760, h: 440 };
const CELL = { w: 132, h: 44 };
const GAP = 36;
const STAGE = 'Stage';
/** Menu: Tab or Esc on the keyboard, Start on a pad (docs/02 controls). */
/** Tab and the pad's Back/Select open the pocket computer; Esc and Start open the game menu (ui/menu.ts). */
export const MENU_KEYS = ['TAB'];
export const MENU_PAD = 8;

/** The menu key: opens the map once you have the pocket computer, closes it if open. One owner (the HUD) calls this. */
export function toggleMap(scenes: Phaser.Scenes.ScenePlugin): void {
  if (scenes.isActive('PocketComputer')) scenes.stop('PocketComputer');
  else if (pocketMap.unlocked) scenes.launch('PocketComputer');
}

/**
 * The pocket computer's map (#69): the approved case and CRT screen (#127) with the rooms you've been in –
 * stage chunks – on it; the room you are in blinks. The stage pauses while it is open. Without the UI atlas the
 * same layout is drawn in code.
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
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, 0.55).setOrigin(0);

    const layout = this.cache.json.get(UI_LAYOUT) as UiLayout | undefined;
    if (this.textures.exists(UI_ATLAS) && layout?.['pocket-frame'] && layout.room) this.drawArt(layout);
    else this.drawPlaceholder();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene.isPaused(STAGE)) this.scene.resume(STAGE);
    });
    this.scene.bringToTop();
  }

  /** The case where the direction puts it, the screen under it, and the rooms nine-sliced to the measured size. */
  private drawArt(layout: UiLayout): void {
    const frame = layout['pocket-frame']!;
    const room = layout.room!;
    const [w, h] = frame.size;
    const ox = layout.pocket?.x ?? Math.round((VIEW_WIDTH - w) / 2);
    const oy = layout.pocket?.y ?? Math.round((VIEW_HEIGHT - h) / 2);
    this.add.image(ox, oy, UI_ATLAS, 'crt-screen').setOrigin(0);
    const [sx, sy, sw, sh] = frame.screen;
    const map = layoutMap(pocketMap.rooms(), { w: room.w, h: room.h }, room.gap);
    const left = ox + sx + Math.round((sw - map.width) / 2);
    const top = oy + sy + Math.round((sh - map.height) / 2);
    for (const c of map.corridors) {
      const piece = c.vertical ? 'corridor-v' : 'corridor-h';
      const img = this.add.image(left + c.x, top + c.y, UI_ATLAS, piece).setOrigin(c.vertical ? 0.5 : 0, c.vertical ? 0 : 0.5);
      // Corridors run under the rooms' glowing edges by a few pixels on each end.
      if (c.vertical) img.setDisplaySize(img.width, c.length + 8).setY(img.y - 4);
      else img.setDisplaySize(c.length + 8, img.height).setX(img.x - 4);
    }
    for (const p of map.rooms) {
      // Nine-sliced: the tile's glowing border keeps its width at the direction's 4:3 room size.
      this.add.nineslice(left + p.x, top + p.y, UI_ATLAS, p.frame, room.w, room.h, room.inset, room.inset, room.inset,
        room.inset).setOrigin(0);
      if (!p.icon) continue;
      const cx = left + p.x + room.w / 2;
      const cy = top + p.y + room.h / 2;
      if (p.icon !== 'player-dot') {
        this.add.image(cx, cy, UI_ATLAS, p.icon);
        continue;
      }
      const dot = this.add.image(cx, cy, UI_ATLAS, 'player-dot-0');
      this.time.addEvent({ delay: 380, loop: true,
        callback: () => dot.setFrame(dot.frame.name === 'player-dot-0' ? 'player-dot-1' : 'player-dot-0') });
    }
    this.add.image(ox, oy, UI_ATLAS, 'pocket-frame').setOrigin(0);
  }

  /** Without the atlas: the same layout as rectangles in a grey case. */
  private drawPlaceholder(): void {
    const x = (VIEW_WIDTH - SCREEN.w) / 2;
    const y = (VIEW_HEIGHT - SCREEN.h) / 2;
    const g = this.add.graphics();
    g.fillStyle(C.caseDark).fillRoundedRect(x - 28, y - 28, SCREEN.w + 56, SCREEN.h + 56, 18);
    g.fillStyle(C.case).fillRoundedRect(x - 24, y - 24, SCREEN.w + 48, SCREEN.h + 48, 16);
    g.fillStyle(C.screen).fillRect(x, y, SCREEN.w, SCREEN.h);
    const map: MapLayout = layoutMap(pocketMap.rooms(), CELL, GAP);
    const left = x + Math.round((SCREEN.w - map.width) / 2);
    const top = y + Math.round((SCREEN.h - map.height) / 2);
    g.lineStyle(3, C.roomEdge);
    for (const c of map.corridors) {
      g.lineBetween(left + c.x, top + c.y, left + c.x + (c.vertical ? 0 : c.length), top + c.y + (c.vertical ? c.length : 0));
    }
    for (const p of map.rooms) {
      if (p.frame === 'room-unexplored') {
        g.lineStyle(1, C.roomEdge).strokeRect(left + p.x, top + p.y, CELL.w, CELL.h);
        continue;
      }
      g.fillStyle(C.roomEdge).fillRect(left + p.x, top + p.y, CELL.w, CELL.h);
      g.fillStyle(C.room, 0.85).fillRect(left + p.x + 3, top + p.y + 3, CELL.w - 6, CELL.h - 6);
      if (p.icon === 'player-dot') {
        const dot = this.add.rectangle(left + p.x + CELL.w / 2, top + p.y + CELL.h / 2, 10, 10, C.screen);
        this.tweens.add({ targets: dot, alpha: 0, duration: 380, yoyo: true, repeat: -1 });
      }
    }
    // Static scanlines over the screen: the CRT look without a shader.
    g.fillStyle(C.scan, 0.28);
    for (let row = y; row < y + SCREEN.h; row += 3) g.fillRect(x, row, SCREEN.w, 1);
  }
}
