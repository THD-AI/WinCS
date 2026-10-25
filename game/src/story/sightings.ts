import Phaser from 'phaser';
import { addRim } from '../stage/atmosphere/pipeline';
import type { CollisionChunk } from '../stage/collision';
import { NPC_DEPTH } from '../stage/depth';
import { createAnims, type AtlasAnim } from './atlases';
import { sightingMarkers, sightingPhase } from './sightingModel';

/** What he does in each sighting (`act` on the marker). */
const ACTS: Record<string, { anim: AtlasAnim; key: string }> = {
  beckon: { anim: ['dexter-acts', 'beckon', 3, -1], key: 'dexter-acts:beckon' },
  creepy: { anim: ['dexter-acts', 'creepy', 1, -1], key: 'dexter-acts:creepy' },
  wait: { anim: ['dexter-prologue', 'wait', 3, -1], key: 'dexter-prologue:wait' },
};

/** Dexter's sightings in the underground's rooms (model and timing: `sightingModel.ts`). */
export class Sightings {
  constructor(scene: Phaser.Scene & { playerActor?: { body: { x: number; y: number } } }, chunks: CollisionChunk[]) {
    const markers = sightingMarkers(chunks);
    if (!markers.length) return;
    createAnims(scene, Object.values(ACTS).map(a => a.anim));
    const rows = markers.flatMap(marker => {
      const act = ACTS[String(marker.act)] ?? ACTS.wait;
      if (!scene.anims.exists(act.key)) return [];
      const sprite = scene.add.sprite(marker.x, marker.y, act.key.split(':')[0]).setOrigin(0.5, 1)
        .setDepth(NPC_DEPTH.min).setFlipX(marker.face === -1);
      sprite.play(act.key);
      addRim(sprite);
      return [{ marker, sprite, since: undefined as number | undefined }];
    });
    const update = (_time: number, delta: number) => {
      const hero = scene.playerActor?.body;
      if (!hero) return;
      for (const row of rows) {
        if (!row.sprite.active) continue;
        const phase = sightingPhase(hero, row.marker, row.since);
        if (phase === 'flicker' && row.since === undefined) row.since = 0;
        if (row.since !== undefined) row.since += delta / 1000;
        if (phase === 'flicker') row.sprite.setVisible(Math.floor((row.since ?? 0) * 30) % 2 === 0);
        if (phase === 'gone') row.sprite.destroy();
      }
    };
    scene.events.on('update', update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('update', update));
  }
}
