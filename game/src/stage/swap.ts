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

/** A `turn` box's crossing: the same region in the box's target state, landing where the hero stands. */
export function turnTarget(kind: string, region: string, state: RegionState | undefined, at: Position): RegionTarget | undefined {
  return kind === 'turn' && state ? { region, state, spawn: { x: at.x, y: at.y } } : undefined;
}

type Scenes = Pick<Phaser.Scenes.SceneManager, 'pause' | 'resume' | 'isPaused' | 'isActive'>;

/**
 * Hold or release the stage under the menu, at once. A scene's own `this.scene.resume()` waits for the next frame,
 * so a menu button that closes the menu and swaps the region in one click would revive the stage the swap just
 * stopped (Phaser sets any inactive scene running on resume); only a stage that is really paused is resumed.
 */
export function holdStage(scenes: Scenes, held: boolean, key = 'Stage'): void {
  if (held) { if (scenes.isActive(key)) scenes.pause(key); }
  else if (scenes.isPaused(key)) scenes.resume(key);
}
