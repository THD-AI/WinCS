import Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import { JENNY_BOX } from '../enemies/jenny';
import { ramFrame, ramPlan, type RamFrame } from '../enemies/jennyRam';
import { sound } from '../fx/sound/Audio';
import type { CollisionChunk } from '../stage/collision';
import type { StageManifest } from '../stage/manifest';
import { swapRegion, type RegionTarget } from '../stage/swap';
import type { CrossingData, CrossingHero } from './Crossing';
import { Prologue } from './Prologue';

const STAGE = 'Stage';
/** After the ram: the rust maze, back at its start (the anomaly's player spawn). */
const TO_MAZE: RegionTarget = { region: 'rusty-creek', state: 'anomaly' };
/** Where the prologue's 404 pull lands the hero (docs/03 region 1, beat 1). */
const AFTER_PROLOGUE: RegionTarget = { region: 'rusty-creek', state: 'clean' };

/** The part of the stage's start data the story reads. */
interface StageData { manifest?: StageManifest; collisions?: CollisionChunk[] }

/**
 * The slice's route between regions (docs/03, #35 #50 #51 #54): in the Hidden Garden the prologue runs â€“
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

  /**
   * Jenny's ram on the creek path (P5) as one event: headlights and engine from beyond the right edge (the tell),
   * she rolls into view revving, charges, hits the hero and throws him the way she drives; the frame breaks into
   * the crash crossing ("THD.exe has stopped responding" – not the 404's tear) and the hero lands at the maze start.
   */
  private ram(hero: Position): void {
    this.busy = true;
    const stage = this.scene.get(STAGE) as Phaser.Scene & { playerActor?: { sprite: Phaser.GameObjects.Sprite; body: { vx: number } } };
    if (!stage?.textures.exists('boss-jenny')) return this.cross(TO_MAZE);
    // The hero freezes where the lights appear (a player holding right would otherwise outrun her); the swap gives
    // the input back.
    this.lockInput(stage, true);
    if (stage.playerActor) stage.playerActor.body.vx = 0;
    const camera = stage.cameras.main;
    const viewRight = camera.scrollX + camera.width;
    const plan = ramPlan(hero.x, viewRight);
    const lights = headlights(stage);
    const jenny = stage.add.sprite(plan.startX, hero.y, 'boss-jenny', 'rev-00').setOrigin(0.5, 1).setDepth(150);
    let thrown: Phaser.GameObjects.Sprite | undefined;
    let t = 0, last: RamFrame['phase'] | undefined, puff = 0;
    sound.play('jenny-engine');
    camera.shake(plan.chargeAt * 1000, 0.0015);
    // Driven by the stage clock (not tweens), so it pauses with the stage and steps in tests.
    const step = (_time: number, delta: number) => {
      t += delta / 1000;
      const f = ramFrame(t, plan, hero, viewRight);
      const entered = f.phase !== last;
      last = f.phase;
      jenny.setPosition(Math.round(f.jennyX), hero.y + (f.phase === 'rev' ? Math.floor(t * 24) % 2 : 0)).setFrame(f.jennyFrame);
      lights.setPosition(Math.round(f.lightsX), hero.y).setAlpha(f.lights);
      if (f.phase === 'rev' && (puff -= delta) <= 0) { puff = 80; exhaust(stage, jenny); }
      if (entered && f.phase === 'rev') sound.play('jenny-engine');
      if (entered && f.phase === 'charge') sound.play('chair-whoosh');
      if (entered && f.phase === 'thrown') {
        sound.play('chair-hit');
        sound.play('player-hurt');
        camera.shake(260, 0.012);
        camera.flash(90, 255, 244, 203);
        stage.playerActor?.sprite.setVisible(false);
        thrown = stage.add.sprite(hero.x, hero.y, 'hero-hurt', 'hit-00').setOrigin(0.5, 1).setDepth(151);
      }
      if (f.hero) thrown?.setPosition(Math.round(f.hero.x), Math.round(f.hero.y)).setAngle(f.hero.angle).setFrame(f.hero.frame);
      if (entered && f.phase === 'cross') {
        stage.events.off('update', step);
        this.lockInput(stage, false);
        this.cross(TO_MAZE);
      }
    };
    stage.events.on('update', step);
    stage.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stage.events.off('update', step));
  }

  private lockInput(stage: Phaser.Scene, locked: boolean): void {
    const keyboard = stage.input.keyboard;
    if (locked) keyboard?.resetKeys();
    if (keyboard) keyboard.enabled = !locked;
    if (stage.input.gamepad) stage.input.gamepad.enabled = !locked;
  }
}

/** Two headlights and their beam back along the path: the tell, growing out of the right edge before she is seen. */
function headlights(stage: Phaser.Scene): Phaser.GameObjects.Container {
  const beam = stage.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  beam.fillStyle(0xfff4cb, 0.26).fillTriangle(0, -44, -520, -110, -520, 10);
  beam.fillStyle(0xfff4cb, 0.2).fillTriangle(0, -44, -360, -80, -360, -10);
  const lampA = stage.add.ellipse(0, -46, 26, 14, 0xffffff).setBlendMode(Phaser.BlendModes.ADD);
  const lampB = stage.add.ellipse(14, -40, 18, 10, 0xfff4cb).setBlendMode(Phaser.BlendModes.ADD);
  return stage.add.container(0, 0, [beam, lampA, lampB]).setDepth(152).setAlpha(0);
}

/** A grey puff from her tail while she revs (her frames face left, so the tail is to the right). */
function exhaust(stage: Phaser.Scene, jenny: Phaser.GameObjects.Sprite): void {
  const puff = stage.add.circle(jenny.x + JENNY_BOX.w / 2 - 10, jenny.y - 24, 6, 0x9aa3a8, 0.7).setDepth(149);
  stage.tweens.add({ targets: puff, x: puff.x + 30 + Math.random() * 20, y: puff.y - 14 - Math.random() * 10,
    scale: 2.4, alpha: 0, duration: 420, onComplete: () => puff.destroy() });
}
