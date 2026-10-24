import Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import { VIEW_WIDTH } from '../core/viewport';
import { sound } from '../fx/sound/Audio';
import type { CollisionChunk } from '../stage/collision';
import type { StageManifest } from '../stage/manifest';
import { swapRegion, type RegionTarget } from '../stage/swap';
import type { CrossingData, CrossingHero } from './Crossing';
import { Prologue } from './Prologue';

const STAGE = 'Stage';
/** Jenny's ram on the clean bridge: she enters from beyond the right edge of the view at charge speed (px/s). */
const RAM_SPEED = 900;
const RAM_LEAD = VIEW_WIDTH * 0.7;
/** Where the prologue's 404 pull lands the hero (docs/03 region 1, beat 1). */
const AFTER_PROLOGUE: RegionTarget = { region: 'rusty-creek', state: 'clean' };

/** The part of the stage's start data the story reads. */
interface StageData { manifest?: StageManifest; collisions?: CollisionChunk[] }

/**
 * The slice's route between regions (docs/03, #35 #50 #51 #54): in the Hidden Garden the prologue runs –
 * Dexter leads the hero to the pond, shoves him in, and the 404 pulls him into clean Rusty Creek; on the clean
 * bridge Jenny rams you, and the crash turns the creek into the rust maze, back at its start. Each step reacts
 * to the stage or a `trigger-entered` kind and swaps the region on the crossing's cut.
 */
export class Flow extends Phaser.Scene {
  private busy = false;
  /** The running prologue, when the stage is a region with Dexter's bench (dev: `game.scene.getScene('Flow').prologue`). */
  prologue?: Prologue;

  constructor() { super({ key: 'Flow', active: true }); }

  create(): void {
    const stage = this.scene.get(STAGE);
    const begin = () => this.beginPrologue(stage);
    stage?.events.on(Phaser.Scenes.Events.CREATE, begin);
    if (stage && this.scene.isActive(STAGE)) begin();
    const stop = gameEvents.on('trigger-entered', ({ kind, region, position }) => {
      if (this.busy) return;
      // The pond is the prologue's finale; without a prologue (no bench in the data) it is the plain crossing.
      if (kind === 'anomaly' && region === 'hidden-garden' && !this.prologue) this.cross(AFTER_PROLOGUE);
      if (kind === 'jenny-ram' && region === 'rusty-creek') this.ram(position);
    });
    const ready = gameEvents.on('region-turned', () => { this.time.delayedCall(500, () => { this.busy = false; }); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stop();
      ready();
      stage?.events.off(Phaser.Scenes.Events.CREATE, begin);
    });
  }

  /** Every time the stage starts: the prologue runs where the region's data seats Dexter on his bench. */
  private beginPrologue(stage: Phaser.Scene): void {
    this.prologue = undefined;
    const data = stage.sys.settings.data as StageData | undefined;
    const chunks = data?.collisions ?? [];
    if (!Prologue.fits(chunks)) return;
    const prologue = new Prologue(stage, chunks, data?.manifest?.region ?? 'hidden-garden', (hero, onLand) => this.crash404(hero, onLand));
    this.prologue = prologue;
    stage.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (this.prologue === prologue) this.prologue = undefined; });
  }

  /** The prologue's end: the 404 crossing pulls the hero into the void; on its cut, clean Rusty Creek. */
  private crash404(hero: CrossingHero, onLand: () => void): void {
    this.busy = true;
    const data: CrossingData = {
      variant: '404', hero,
      onLand: () => { onLand(); swapRegion(this, AFTER_PROLOGUE); },
    };
    this.scene.launch('Crossing', data);
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
