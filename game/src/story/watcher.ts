import Phaser from 'phaser';
import { addRim } from '../stage/atmosphere/pipeline';
import type { Box, CollisionChunk } from '../stage/collision';
import { createAnims } from './atlases';
import { WATCH, watchPhase } from './dexterWatch';

/** The watcher's beat in the clean creek (model and timing: `dexterWatch.ts`). */
export class Watcher {
  private since?: number;
  private readonly startX: number;

  static spot(chunks: CollisionChunk[]): Box | undefined {
    return chunks.flatMap(c => c.world.interact).find(b => b.kind === 'jenny-ram');
  }

  constructor(private scene: Phaser.Scene & { playerActor?: { body: { x: number } } }, ram: Box) {
    createAnims(scene, [['dexter-prologue', 'wait', 3, -1], ['dexter', 'hop', 4, -1]]);
    this.startX = ram.x + ram.w + WATCH.beyond;
    // He faces the hero (left); the 1 px rim keeps the black plush readable against the creek.
    const dexter = scene.add.sprite(this.startX, ram.y + ram.h, 'dexter-prologue', 'wait-00')
      .setOrigin(0.5, 1).setDepth(101).setFlipX(true);
    dexter.play('dexter-prologue:wait');
    addRim(dexter);
    const update = (_time: number, delta: number) => {
      const hero = scene.playerActor?.body.x;
      if (hero === undefined) return;
      const phase = watchPhase(hero, this.startX, this.since);
      if (phase === 'leave' && this.since === undefined) { this.since = 0; dexter.setFlipX(false).play('dexter:hop'); }
      if (this.since !== undefined) this.since += delta / 1000;
      if (phase === 'leave') {
        const k = Math.min(1, (this.since ?? 0) / WATCH.hopSeconds);
        dexter.setX(Math.round(this.startX + WATCH.hop * k)).setAlpha(1 - k * k);
      }
      if (phase === 'gone') { dexter.destroy(); scene.events.off('update', update); }
    };
    scene.events.on('update', update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('update', update));
  }
}
