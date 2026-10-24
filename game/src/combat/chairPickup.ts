import type Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { Player } from '../player/player';
import type { Box, CollisionChunk } from '../stage/collision';
import type { ChairCombat } from './chair';

/** Game-wide flag (Phaser's registry outlives the stage): the hero carries the chair from here on. */
export const CARRYING_CHAIR = 'carrying-chair';
/** Dev URLs that start mid-level and need the chair in hand. */
const TESTS = ['combat-test', 'rover-test', 'coffee-test', 'boss-test'];

export function carriesChair(scene: Phaser.Scene): boolean {
  if (import.meta.env.DEV && TESTS.some(test => new URLSearchParams(location.search).has(test))) return true;
  return scene.registry.get(CARRYING_CHAIR) === true;
}

/**
 * The plywood chair lying by the path (docs/03 beat 3, #156): drawn from the approved `chair-pickup` frame at every
 * `pickup` box whose item is `chair`. Walking into it plays the hero's interact pose and arms the chair for good.
 */
export class ChairPickup {
  private sprites = new Map<Box, Phaser.GameObjects.Sprite>();

  constructor(scene: Phaser.Scene, player: Player, chair: ChairCombat, chunks: CollisionChunk[]) {
    if (carriesChair(scene)) return;
    const boxes = chunks.flatMap(c => c.world.interact).filter(b => b.kind === 'pickup' && b.item === 'chair');
    for (const box of boxes) {
      this.sprites.set(box, scene.add.sprite(box.x + box.w / 2, box.y + box.h, 'chair-side', 'chair-pickup-00')
        .setOrigin(0.5, 1).setDepth(99));
    }
    const off = gameEvents.on('trigger-entered', ({ id }) => {
      const box = [...this.sprites.keys()].find(b => b.id === id);
      if (!box || !player.beginInteraction()) return;
      this.sprites.get(box)?.destroy();
      this.sprites.clear();
      scene.registry.set(CARRYING_CHAIR, true);
      chair.enabled = true;
      sound.play('chair-hit');
    });
    scene.events.once('shutdown', off);
  }
}
