import Phaser from 'phaser';

/** The old Windows error dialog from the anomaly-language frame; the text is real, rendered by the game. */
export const CRASH_TEXT = 'THD.exe has stopped responding.';

const W = 420;
const H = 150;
const C = { face: 0xc0c0c0, light: 0xffffff, shadow: 0x808080, dark: 0x0a0a0a, title: 0x0a246a, icon: 0xc0181f };

export interface CrashWindow {
  container: Phaser.GameObjects.Container;
  ok: Phaser.GameObjects.Zone;
}

/** A bevelled grey window centred at (x, y), with the THD.exe title bar, the red X icon and one OK button. */
export function crashWindow(scene: Phaser.Scene, x: number, y: number): CrashWindow {
  const g = scene.add.graphics();
  bevel(g, -W / 2, -H / 2, W, H);
  g.fillStyle(C.title).fillRect(-W / 2 + 4, -H / 2 + 4, W - 8, 24);
  bevel(g, W / 2 - 26, -H / 2 + 7, 18, 18);
  g.lineStyle(2, C.dark).lineBetween(W / 2 - 22, -H / 2 + 11, W / 2 - 12, -H / 2 + 21).lineBetween(W / 2 - 12, -H / 2 + 11, W / 2 - 22, -H / 2 + 21);
  g.fillStyle(C.icon).fillCircle(-W / 2 + 40, -6, 18);
  g.lineStyle(4, C.light).lineBetween(-W / 2 + 32, -14, -W / 2 + 48, 2).lineBetween(-W / 2 + 48, -14, -W / 2 + 32, 2);
  bevel(g, -40, H / 2 - 42, 80, 28);
  g.lineStyle(1, C.dark).strokeRect(-37, H / 2 - 39, 74, 22);
  const font = { fontFamily: 'Tahoma, Verdana, sans-serif', fontSize: '15px' };
  const title = scene.add.text(-W / 2 + 10, -H / 2 + 8, 'THD.exe', { ...font, color: '#ffffff', fontStyle: 'bold' });
  const message = scene.add.text(-W / 2 + 72, -16, CRASH_TEXT, { ...font, color: '#000000' });
  const okLabel = scene.add.text(0, H / 2 - 28, 'OK', { ...font, color: '#000000' }).setOrigin(0.5);
  const ok = scene.add.zone(0, H / 2 - 28, 80, 28).setInteractive({ useHandCursor: true });
  const container = scene.add.container(x, y, [g, title, message, okLabel, ok]);
  return { container, ok };
}

function bevel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(C.dark).fillRect(x, y, w, h);
  g.fillStyle(C.light).fillRect(x, y, w - 1, h - 1);
  g.fillStyle(C.shadow).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(C.face).fillRect(x + 1, y + 1, w - 3, h - 3);
}
