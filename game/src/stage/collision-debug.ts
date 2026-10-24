import type Phaser from 'phaser';
import { BOXES, LINES, POINTS, type CollisionChunk } from './collision';

const COLOURS = { walk: 0x28dc3c, slide: 0x965a28, oneWay: 0xffdc00, climb: 0x286eff,
  solid: 0xe61e1e, noGo: 0x000000, hazard: 0xff8c00, interact: 0xaa3cdc,
  spawn: 0xffffff, ledge: 0x00e6e6, glideLift: 0xaad2ff };

/** F2 toggles the authoring legend over the same world geometry used by physics. */
export function collisionDebug(scene: Phaser.Scene, chunks: CollisionChunk[]) {
  const graphics = scene.add.graphics().setDepth(10000).setVisible(false);
  for (const { world } of chunks) {
    for (const key of BOXES) for (const b of world[key]) {
      graphics.fillStyle(COLOURS[key], 0.27).fillRect(b.x, b.y, b.w, b.h);
      graphics.lineStyle(3, COLOURS[key]).strokeRect(b.x, b.y, b.w, b.h);
    }
    for (const key of LINES) for (const line of world[key]) {
      graphics.lineStyle(5, COLOURS[key]).beginPath().moveTo(...line[0]);
      for (const p of line.slice(1)) graphics.lineTo(...p);
      graphics.strokePath();
    }
    for (const key of POINTS) for (const p of world[key]) {
      graphics.fillStyle(COLOURS[key]).fillCircle(p.x, p.y, 6);
      if (key === 'spawn' && p.kind === 'player') graphics.lineStyle(2, 0xffffff).strokeRect(p.x - 14, p.y - 76, 28, 76);
    }
  }
  const toggle = () => graphics.setVisible(!graphics.visible);
  scene.input.keyboard?.on('keydown-F2', toggle);
  scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown-F2', toggle));
  return graphics;
}
