/**
 * Phaser depth bands (docs/15 contract). Every scene object that shares the stage picks its depth here,
 * so the layers, the actors and the foreground always stack the same way.
 *
 *   0 – 99      stage layers z 0–5, in manifest list order (the list order is the alpha composition)
 *   90          leaves falling behind the actors
 *   99 – 110    actors: props 99, hero 100, NPCs 101–105, actor FX up to 110
 *   150         leaves falling in front of the hero, behind the foreground plants
 *   200 – 299   stage layers z 6–7 (foreground) – they pass over the hero
 *   1000+       screen FX and HUD
 */
export const PROP_DEPTH = 99;
export const HERO_DEPTH = 100;
export const NPC_DEPTH = { min: 101, max: 105 } as const;
export const ACTOR_FX_DEPTH = 110;
export const LEAVES_BEHIND_DEPTH = 90;
export const LEAVES_FRONT_DEPTH = 150;
export const FOREGROUND_DEPTH = 200;
export const SCREEN_FX_DEPTH = 1000;
/** Layers with z at or above this are foreground: drawn over the actors and slightly out of focus. */
export const FOREGROUND_Z = 6;
/** Room for list positions inside a band. */
const BAND = 90;

export const isForeground = (z: number) => z >= FOREGROUND_Z;

/**
 * A layer's depth: z picks the band (behind or in front of the actors), the position in the chunk's
 * layer list orders it inside the band, so the authored composition order is kept.
 */
export function layerDepth(z: number, order: number): number {
  if (!Number.isInteger(order) || order < 0 || order >= BAND) throw new Error(`Layer order ${order} outside its depth band`);
  return (isForeground(z) ? FOREGROUND_DEPTH : 0) + order;
}

/** Just above a layer and below the next one in the list – where a reflection on that layer goes. */
export const above = (depth: number) => depth + 0.5;
