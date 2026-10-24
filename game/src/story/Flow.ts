import Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import { VIEW_WIDTH } from '../core/viewport';
import { sound } from '../fx/sound/Audio';
import { swapRegion, type RegionTarget } from '../stage/swap';
import type { CrossingData } from './Crossing';

const STAGE = 'Stage';
/** Jenny's ram on the clean bridge: she enters from beyond the right edge of the view at charge speed (px/s). */
const RAM_SPEED = 900;
const RAM_LEAD = VIEW_WIDTH * 0.7;

/**
 * The slice's route between regions (docs/03, #35 #51 #54): the Hidden Garden's pond is the anomaly that
 * crashes you into clean Rusty Creek; on the clean bridge Jenny rams you, and the crash turns the creek into
 * the rust maze, back at its start. Each step reacts to a `trigger-entered` kind and swaps the region on the
 * crossing's cut.
 */
export class Flow extends Phaser.Scene {
  private busy = false;

  constructor() { super({ key: 'Flow', active: true }); }

  create(): void {
    const stop = gameEvents.on('trigger-entered', ({ kind, region, position }) => {
      if (this.busy) return;
      if (kind === 'anomaly' && region === 'hidden-garden') this.cross({ region: 'rusty-creek', state: 'clean' });
      if (kind === 'jenny-ram' && region === 'rusty-creek') this.ram(position);
    });
    const ready = gameEvents.on('region-turned', () => { this.time.delayedCall(500, () => { this.busy = false; }); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { stop(); ready(); });
  }

  /** The THD.exe crossing over the frozen stage; on the cut the region swaps. */
  private cross(target: RegionTarget): void {
    this.busy = true;
    const data: CrossingData = { onLand: () => swapRegion(this, target) };
    this.scene.launch('Crossing', data);
  }

  /** Jenny comes out of nowhere along the bridge and hits the hero; the crash is the crossing. */
  private ram(hero: Position): void {
    this.busy = true;
    const stage = this.scene.get(STAGE);
    if (!stage?.textures.exists('boss-jenny')) return this.cross({ region: 'rusty-creek', state: 'anomaly' });
    const jenny = stage.add.sprite(hero.x + RAM_LEAD, hero.y, 'boss-jenny', 'charge-00').setOrigin(0.5, 1).setDepth(150);
    sound.play('chair-whoosh');
    stage.tweens.add({
      targets: jenny, x: hero.x + jenny.width * 0.3, duration: (RAM_LEAD / RAM_SPEED) * 1000, ease: 'Quad.easeIn',
      // The approved charge clip, 4 frames at 12 fps (boss-jenny.anims.json).
      onUpdate: tween => jenny.setFrame(`charge-0${Math.floor(tween.elapsed / (1000 / 12)) % 4}`),
      onComplete: () => {
        sound.play('chair-hit');
        this.cross({ region: 'rusty-creek', state: 'anomaly' });
      },
    });
  }
}
