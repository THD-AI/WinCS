import type Phaser from 'phaser';
import type { Wind } from '../stage/atmosphere/config';
import { gustAt } from '../stage/atmosphere/wind';

/**
 * Idle life without new art (docs/09 'Smooth, not rubbery'): the standing hero is drawn as three crops of its own
 * frame. Above BREATH_ROW the chest and hood rise 1 px on the in-breath (the row at the split is drawn twice,
 * the classic pixel-art breath); BREATH_ROW–HEM_ROW, the poncho's lower half and fringe, takes 1 px downwind while
 * a gust passes; the legs below never move. Whole pixels only: nothing is scaled, rotated or blended.
 */
export const BREATH_ROW = 43;
export const HEM_ROW = 73;
/** The idle frames are 118 px tall (the 114 px hero, 24 Oct: 1.5x so the hero reads against the world, A15); any other frame is drawn whole. */
export const FRAME_HEIGHT = 118;
/** Wind push (the atmosphere's base sway + gust lean) at which the poncho takes its pixel, and below which it lets go. */
export const SWAY_ON = 0.6;
export const SWAY_OFF = 0.35;
/** The poncho never changes its pixel more often than this (s): a gust is a lean, not a flicker. */
export const SWAY_HOLD = 0.35;

/** The push of the same wind the foliage shader and the leaves show, at world x and time t (s). */
export function windPush(wind: Wind, x: number, t: number) {
  return wind.base * Math.sin(Math.PI * 2 * wind.frequency * t + x * 0.004) + wind.gust * gustAt(wind, x, t) * wind.direction;
}

/** −1, 0 or 1 px for the poncho, with hysteresis and a minimum hold; 0 whenever the hero is not standing. */
export class PonchoSway {
  offset = 0;
  private held = SWAY_HOLD;
  update(wind: Wind | null, x: number, t: number, dt: number, standing: boolean) {
    this.held += dt;
    if (!standing || !wind) { this.offset = 0; return 0; }
    const push = windPush(wind, x, t);
    const want = Math.abs(push) >= SWAY_ON ? Math.sign(push) : Math.abs(push) < SWAY_OFF ? 0 : this.offset;
    if (want !== this.offset && this.held >= SWAY_HOLD) { this.offset = want; this.held = 0; }
    return this.offset;
  }
}

/** Crop rows (top, height) of the three slices of a frame `height` px tall with `cover` rows hidden at the feet. */
export function sliceRows(breath: number, cover: number, height = FRAME_HEIGHT) {
  return {
    chest: [0, BREATH_ROW + breath] as const,
    poncho: [BREATH_ROW, HEM_ROW - BREATH_ROW] as const,
    legs: [HEM_ROW, Math.max(0, height - HEM_ROW - cover)] as const,
  };
}

/** The two upper slices over the player's sprite, which keeps the legs (and stays the sprite everyone else reads). */
export class HeroSlices {
  private chest: Phaser.GameObjects.Sprite;
  private poncho: Phaser.GameObjects.Sprite;
  constructor(scene: Phaser.Scene, private base: Phaser.GameObjects.Sprite) {
    const make = () => scene.add.sprite(base.x, base.y, base.texture.key, base.frame.name).setOrigin(0.5, 1).setVisible(false);
    this.chest = make(); this.poncho = make();
  }
  /** The slice sprites, so the player can give them the same pipeline as the sprite they copy. */
  get parts(): Phaser.GameObjects.Sprite[] { return [this.chest, this.poncho]; }
  destroy() { this.chest.destroy(); this.poncho.destroy(); }
  /** `breath` 0/1 px up, `sway` −1/0/1 px in world x; both 0 (or a frame that is not a hero idle) draws the sprite whole. */
  apply(breath: number, sway: number, cover: number) {
    const base = this.base, frame = base.frame;
    const on = (breath !== 0 || sway !== 0) && base.visible && frame.height === FRAME_HEIGHT;
    this.chest.setVisible(on); this.poncho.setVisible(on);
    if (!on) {
      if (cover > 0) base.setCrop(0, 0, frame.width, frame.height - cover);
      else if (base.isCropped) base.setCrop();
      return;
    }
    const rows = sliceRows(breath, cover, frame.height);
    for (const [slice, [top, height], dx, dy] of [[this.chest, rows.chest, 0, -breath], [this.poncho, rows.poncho, sway, 0]] as const) {
      if (slice.texture !== base.texture || slice.frame.name !== frame.name) slice.setTexture(base.texture.key, frame.name);
      slice.setPosition(base.x + dx, base.y + dy).setFlipX(base.flipX).setAlpha(base.alpha).setDepth(base.depth)
        .setCrop(0, top, frame.width, height);
    }
    base.setCrop(0, rows.legs[0], frame.width, rows.legs[1]);
  }
}
