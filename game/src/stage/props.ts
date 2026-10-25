import type Phaser from 'phaser';
import type { CollisionChunk, Marker } from './collision';
import type { Body } from '../player/body';
import { PROP_DEPTH } from './depth';
import { sheetAnimations } from './atmosphere/sprites';

/**
 * Story props: small details that blink, appear or vanish, drawn as sprites over the painted rooms (docs/09: props,
 * not repaints). They are `spawn` markers in the collision files; the art is the `it-props` board (art/sprites):
 * - `balloon`: a red balloon pressed against the pond's underside; its string runs down `rise` px to where it is
 *   tied (the marker). It bobs a little and never floats away.
 * - `pipe-eyes`: two glossy plush eyes in the dark of a pipe, watching. Come closer and they narrow and are gone –
 *   for good, until the region is loaded again (secret horror: friendly first, wrong on a second look).
 * - `paper-boat`: a soggy paper boat rocking at the outlet.
 */
export const PROP_KINDS = ['balloon', 'pipe-eyes', 'paper-boat'] as const;
export type PropKind = typeof PROP_KINDS[number];
const BOARD = 'it-props';
/** The eyes notice you this close (px, horizontally, in their room) and narrow for this long before they go. */
export const EYES_NOTICE = 320;
export const EYES_NARROW = 450;
/** The balloon's knot sits this far below the sprite's top (the board's string is left off: the game draws it). */
const KNOT = 24;
const ROW = 720;

export type EyesState = 'watching' | 'narrowed' | 'gone';

/** The eyes in the pipe, one step: watching until the hero comes near in the same room, narrowed, then gone. */
export class EyesModel {
  state: EyesState = 'watching';
  private left = EYES_NARROW;
  constructor(readonly x: number, readonly y: number) {}
  step(hero: { x: number; y: number }, dt: number): EyesState {
    const sameRoom = Math.floor(hero.y / ROW) === Math.floor(this.y / ROW);
    if (this.state === 'watching' && sameRoom && Math.abs(hero.x - this.x) < EYES_NOTICE) this.state = 'narrowed';
    else if (this.state === 'narrowed' && (this.left -= dt) <= 0) this.state = 'gone';
    return this.state;
  }
}

/** The props among a region's spawn markers. */
export function propMarkers(chunks: Pick<CollisionChunk, 'world'>[]): (Marker & { kind: PropKind })[] {
  return chunks.flatMap(chunk => chunk.world.spawn)
    .filter((m): m is Marker & { kind: PropKind } => (PROP_KINDS as readonly string[]).includes(m.kind ?? ''));
}

/** The balloon's bob (px, negative is up): a slow push against the ceiling, never higher than it. */
export const bob = (t: number) => Math.round(Math.max(0, Math.sin(t / 900)) * 2);

export class Props {
  private eyes: { model: EyesModel; sprite: Phaser.GameObjects.Sprite }[] = [];
  private balloons: { marker: Marker; sprite: Phaser.GameObjects.Sprite; string: Phaser.GameObjects.Graphics }[] = [];

  constructor(private scene: Phaser.Scene, chunks: CollisionChunk[], private hero: () => Body | undefined) {
    const anims = sheetAnimations(scene, BOARD);
    if (!anims) return; // the board is not exported: no props, no placeholder
    for (const marker of propMarkers(chunks)) {
      const sprite = scene.add.sprite(marker.x, marker.y, BOARD, `${frameOf(marker.kind)}-00`).setOrigin(0.5, 1)
        .setDepth(PROP_DEPTH);
      if (marker.kind === 'balloon') {
        const rise = typeof marker.rise === 'number' ? marker.rise : 0;
        // The atlas frames pivot at the bottom (the animation keeps it): place by the frame's bottom, show its top.
        sprite.setY(marker.y - rise - KNOT + sprite.height).setCrop(0, 0, sprite.width, KNOT + 1);
        const string = scene.add.graphics().setDepth(PROP_DEPTH - 1);
        this.balloons.push({ marker, sprite, string });
        sprite.anims.play(anims.balloon);
      } else if (marker.kind === 'pipe-eyes') {
        this.eyes.push({ model: new EyesModel(marker.x, marker.y), sprite });
      } else {
        sprite.anims.play(anims.boat);
      }
    }
  }

  update(dt: number): void {
    const hero = this.hero();
    for (const { model, sprite } of this.eyes) {
      if (!sprite.visible) continue;
      const was = model.state;
      const now = hero ? model.step(hero, dt) : was;
      if (now === was) {
        // A slow glint while watching: frame 1 for a moment every few seconds.
        if (now === 'watching') sprite.setFrame(this.scene.time.now % 3200 < 260 ? 'eyes-01' : 'eyes-00');
        continue;
      }
      if (now === 'narrowed') sprite.setFrame('eyes-02');
      else this.scene.tweens.add({ targets: sprite, alpha: 0, duration: 160, onComplete: () => sprite.setVisible(false) });
    }
    for (const { marker, sprite, string } of this.balloons) {
      const rise = typeof marker.rise === 'number' ? marker.rise : 0;
      const top = marker.y - rise - KNOT - bob(this.scene.time.now);
      sprite.setY(top + sprite.height);
      string.clear().lineStyle(1, 0xe9dfc8, 0.9).beginPath();
      // A little slack: the string bows toward the rail's side.
      string.moveTo(sprite.x, top + KNOT);
      string.lineTo(sprite.x + 1, (top + KNOT + marker.y) / 2);
      string.lineTo(marker.x, marker.y);
      string.strokePath();
    }
  }
}

function frameOf(kind: PropKind): string {
  return kind === 'balloon' ? 'balloon' : kind === 'pipe-eyes' ? 'eyes' : 'boat';
}
