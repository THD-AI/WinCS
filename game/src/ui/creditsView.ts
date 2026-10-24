import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import { CREDITS } from './credits';

const C = { text: '#e8e4dc', dim: '#7d8a90', pick: '#46d1b4' };
const FONT = 'monospace';

/** The credits page, centred on the view, with one hint line at the bottom; shared by the title and the ending. */
export function creditsText(scene: Phaser.Scene, hint: string): Phaser.GameObjects.Text[] {
  const out: Phaser.GameObjects.Text[] = [];
  let y = 110;
  for (const section of CREDITS) {
    out.push(scene.add.text(VIEW_WIDTH / 2, y, section.heading, { fontFamily: FONT, fontSize: '24px', color: C.pick }).setOrigin(0.5));
    y += 36;
    for (const line of section.lines) {
      out.push(scene.add.text(VIEW_WIDTH / 2, y, line, { fontFamily: FONT, fontSize: '18px', color: C.text }).setOrigin(0.5));
      y += 26;
    }
    y += 22;
  }
  out.push(scene.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - 50, hint, { fontFamily: FONT, fontSize: '16px', color: C.dim }).setOrigin(0.5));
  return out;
}
