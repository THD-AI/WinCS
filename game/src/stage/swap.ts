import type Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import type { RegionState } from './manifest';

export interface RegionTarget { region: string; state: RegionState; spawn?: Position }

/** Where the slice begins: the Hidden Garden prologue (docs/03). `?region=` in the URL starts elsewhere. */
export const START: RegionTarget = { region: 'hidden-garden', state: 'clean' };

/**
 * Swap the stage to another region or state (#35): announce it, then reload through Preload, which fetches the
 * manifest and collision of the target. Without `spawn` the hero starts at the region's `player` spawn.
 */
export function swapRegion(scene: Phaser.Scene, target: RegionTarget): void {
  gameEvents.emit('region-turned', { region: target.region, state: target.state });
  // Through the game's scene manager, so the caller (a story scene) keeps running.
  scene.game.scene.stop('Stage');
  scene.game.scene.start('Preload', target);
}
