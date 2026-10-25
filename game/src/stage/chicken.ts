import type Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { CollisionChunk } from './collision';
import { chickenFrame, chickens } from './chickenModel';
import { PROP_DEPTH } from './depth';

const BOARD = 'rubber-chicken';

/** Draws the region's rubber chickens and squeezes them (model: `chickenModel.ts`). */
export function addChickens(scene: Phaser.Scene, chunks: CollisionChunk[]): void {
  const boxes = chickens(chunks);
  if (!boxes.length || !scene.textures.exists(BOARD)) return;
  const sprites = new Map(boxes.map(box => [box.id, scene.add.sprite(box.x + box.w / 2, box.y + box.h, BOARD, 'rest-00')
    .setOrigin(0.5, 1).setDepth(PROP_DEPTH)]));
  const squeezed = new Map<string | undefined, number>();
  const off = gameEvents.on('trigger-entered', ({ kind, id }) => {
    if (kind !== 'rubber-chicken') return;
    squeezed.set(id, scene.time.now);
    sound.play('rubber-squeak');
  });
  const update = () => {
    for (const [id, sprite] of sprites) {
      const at = squeezed.get(id);
      sprite.setFrame(chickenFrame(at === undefined ? undefined : scene.time.now - at));
    }
  };
  scene.events.on('update', update);
  scene.events.once('shutdown', () => { off(); scene.events.off('update', update); });
}
