import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { Player } from '../player/player';
import type { Box, CollisionChunk } from '../stage/collision';
import { drawControlGlyph } from '../ui/Hud';
import type { ChairCombat } from './chair';

/** Game-wide flag (Phaser's registry outlives the stage): the hero carries the chair from here on. */
export const CARRYING_CHAIR = 'carrying-chair';
/** Game-wide flag: the hero has swung the chair once, so the control glyph never shows again. */
export const SWUNG_CHAIR = 'swung-chair';
/** Dev URLs that start mid-level and need the chair in hand. */
const TESTS = ['combat-test', 'rover-test', 'coffee-test', 'boss-test'];
/** After the pick-up clip the hero holds the chair up in its ready pose (chair-side sweep-a-00) this long. */
export const SHOW_SECONDS = 0.6;
/** The glyph floats this far above the hero's feet (the body is 76 px tall). */
const GLYPH_LIFT = 100;
/** How far from the box the hero may still be when a jump into it lands (px). */
const REACH = 24;
/** The carried chair on the hero's back: the centre of the drawn chair in its 86 x 81 frame, and where it hangs
 *  behind the hero's feet anchor (px), turned so the seat sits behind the backpack and the legs rise over the shoulder. */
const BACK = { originX: 54 / 86, originY: 66 / 81, x: -10, y: -52, angle: -105, scale: 0.65 };

export function carriesChair(scene: Phaser.Scene): boolean {
  if (import.meta.env.DEV && TESTS.some(test => new URLSearchParams(location.search).has(test))) return true;
  return scene.registry.get(CARRYING_CHAIR) === true;
}

/** The pick-up moment as pure state (P7): waiting → picking (the clip) → showing (chair held up) → hinting → done. */
export type PickupPhase = 'waiting' | 'picking' | 'showing' | 'hinting' | 'done';
export class PickupMoment {
  phase: PickupPhase = 'waiting';
  elapsed = 0;
  constructor(private clipSeconds: number) {}
  /** The hero reached the chair and the clip started. */
  begin(): void { if (this.phase === 'waiting') { this.phase = 'picking'; this.elapsed = 0; } }
  /** `swung`: the hero swung the chair this frame (any sweep or overhead). */
  step(seconds: number, swung: boolean): PickupPhase {
    if (this.phase === 'waiting' || this.phase === 'done') return this.phase;
    this.elapsed += seconds;
    if (this.phase === 'picking' && this.elapsed >= this.clipSeconds) { this.phase = 'showing'; this.elapsed = 0; }
    else if (this.phase === 'showing' && this.elapsed >= SHOW_SECONDS) { this.phase = 'hinting'; this.elapsed = 0; }
    if (this.phase === 'hinting' && swung) this.phase = 'done';
    return this.phase;
  }
}

/**
 * The plywood chair lying by the path (docs/03 beat 3, #156, P7): drawn from the approved `chair-pickup` frame at
 * every `pickup` box whose item is `chair`, with a glint so you see it. Walking into it is a moment: the hero plays
 * the `pick-up` clip, holds the chair up, and a wordless J / X glyph floats over him until the first swing.
 */
export class ChairPickup {
  private sprites = new Map<Box, Phaser.GameObjects.Sprite>();
  private glints: Phaser.GameObjects.GameObject[] = [];
  private moment?: PickupMoment;
  private glyph?: Phaser.GameObjects.Container;
  private pending?: Box;
  /** The chair the hero carries between swings; the hero has no carrying frames, so it rides on his back. */
  private back?: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene, private player: Player, private chair: ChairCombat, chunks: CollisionChunk[]) {
    const update = (_time: number, delta: number) => { this.update(delta); this.carry(); };
    scene.events.on('postupdate', update);
    scene.events.once('shutdown', () => scene.events.off('postupdate', update));
    if (carriesChair(scene)) {
      // Picked up earlier but never swung (a region swap in between): the hint is still owed.
      if (scene.registry.get(CARRYING_CHAIR) === true && scene.registry.get(SWUNG_CHAIR) !== true) this.hint();
      return;
    }
    const boxes = chunks.flatMap(c => c.world.interact).filter(b => b.kind === 'pickup' && b.item === 'chair');
    for (const box of boxes) {
      const x = box.x + box.w / 2, y = box.y + box.h;
      this.sprites.set(box, scene.add.sprite(x, y, 'chair-side', 'chair-pickup-00').setOrigin(0.5, 1).setDepth(99));
      this.glints.push(...glint(scene, x, y - 40));
    }
    const off = gameEvents.on('trigger-entered', ({ id }) => {
      const box = [...this.sprites.keys()].find(b => b.id === id);
      if (box) this.pending = box;
    });
    scene.events.once('shutdown', off);
  }

  private take(box: Box): void {
    if (!this.player.beginInteraction('pick-up')) return;
    this.pending = undefined;
    const clip = this.scene.cache.json.get('hero-hurt.anims')?.['pick-up'] ?? { frames: 4, fps: 12 };
    this.moment = new PickupMoment(clip.frames / clip.fps);
    this.moment.begin();
    const sprite = this.sprites.get(box);
    // The chair rises into the hero's hands with the clip, then the hero holds it.
    if (sprite) this.scene.tweens.add({ targets: sprite, x: this.player.body.x, y: sprite.y - 30, alpha: 0,
      duration: (clip.frames / clip.fps) * 1000, ease: 'Quad.easeOut', onComplete: () => sprite.destroy() });
    this.sprites.clear();
    for (const item of this.glints) item.destroy();
    this.glints = [];
    this.scene.registry.set(CARRYING_CHAIR, true);
    sound.play('chair-hit');
  }

  /** Keeps the carried chair on the hero's back, behind him, hidden while a chair pose (swing, guard, slam) or the
   *  pick-up holds it in his hands. */
  private carry(): void {
    if (!carriesChair(this.scene)) return;
    const hero = this.player.sprite;
    this.back ??= this.scene.add.image(hero.x, hero.y, 'chair-side', 'chair-pickup-00')
      .setOrigin(BACK.originX, BACK.originY).setScale(BACK.scale);
    const facing = this.player.facing < 0 ? -1 : 1;
    const inHands = hero.texture.key.startsWith('chair-') || hero.texture.key === 'hero-hurt' && hero.frame.name.startsWith('pick-up')
      || this.moment?.phase === 'picking' || this.moment?.phase === 'showing';
    this.back.setVisible(hero.visible && !inHands).setAlpha(hero.alpha).setDepth(hero.depth - 0.5)
      .setPosition(Math.round(hero.x + BACK.x * facing), Math.round(hero.y + BACK.y))
      .setFlipX(facing < 0).setAngle(BACK.angle * facing);
  }

  private hint(): void {
    this.moment = new PickupMoment(0);
    this.moment.phase = 'hinting';
  }

  private update(delta: number): void {
    const body = this.player.body;
    if (this.pending && body.grounded && Math.abs(body.x - (this.pending.x + this.pending.w / 2)) <= this.pending.w / 2 + REACH) {
      this.take(this.pending);
    }
    const moment = this.moment;
    if (!moment) return;
    const swung = this.chair.sweeps.phase !== 'idle' || this.chair.overhead.phase !== 'idle';
    const phase = moment.step(Math.min(100, delta) / 1000, swung);
    if (phase === 'showing') {
      // Held up, ready: the first sweep pose. The chair arms when the show ends, so the J that dismisses the hint
      // is the first real swing.
      this.player.sprite.setTexture('chair-side', 'sweep-a-00').setFlipX(this.player.facing < 0);
    }
    if (phase === 'hinting' || phase === 'done') this.chair.enabled = true;
    if (phase === 'hinting') {
      this.glyph ??= drawControlGlyph(this.scene, body.x, body.y - GLYPH_LIFT).setDepth(10002);
      const bob = Math.round(Math.sin(this.scene.time.now / 180) * 3);
      this.glyph.setPosition(Math.round(body.x), Math.round(body.y - GLYPH_LIFT + bob));
    }
    if (phase === 'done') {
      this.scene.registry.set(SWUNG_CHAIR, true);
      this.glyph?.destroy();
      this.glyph = undefined;
      this.moment = undefined;
    }
  }
}

/** A slow sparkle and a soft pulse over the chair, so it reads as something to take. */
function glint(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.GameObject[] {
  const halo = scene.add.ellipse(x, y + 22, 70, 34, 0xfff4cb, 0.18).setDepth(98).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: halo, alpha: 0.05, scaleX: 1.15, scaleY: 1.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  const star = scene.add.graphics({ x, y }).setDepth(100).setBlendMode(Phaser.BlendModes.ADD);
  star.fillStyle(0xffffff).fillRect(-1, -7, 2, 14).fillRect(-7, -1, 14, 2).fillStyle(0xfff4cb).fillRect(-2, -2, 4, 4);
  star.setScale(0);
  scene.tweens.add({ targets: star, scale: 1, angle: 90, duration: 260, yoyo: true, repeat: -1, repeatDelay: 1100,
    onRepeat: () => star.setPosition(x + Phaser.Math.Between(-16, 16), y + Phaser.Math.Between(-6, 12)) });
  return [halo, star];
}
