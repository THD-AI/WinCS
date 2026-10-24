/**
 * Phaser depth bands (docs/15 contract). Every scene object that shares the stage picks its depth here,
 * so the layers, the actors and the foreground always stack the same way.
 *
 *   0 – 99      stage layers z 0–5, in manifest list order (the list order is the alpha composition)
 *   90          leaves falling behind the actors
 *   99 – 110    actors: props 99, hero 100, NPCs 101–105, actor FX up to 110
 *   120 – 149   stage layers z 6 (near): the grass strip in front of the trail, over the actors' feet
 *   150         leaves falling in front of the hero, behind the foreground plants
 *   200 – 299   stage layers z 7 (foreground) – they pass over the hero
 *   1000+       screen FX and HUD
 */
export const PROP_DEPTH = 99;
export const HERO_DEPTH = 100;
export const NPC_DEPTH = { min: 101, max: 105 } as const;
export const ACTOR_FX_DEPTH = 110;
export const LEAVES_BEHIND_DEPTH = 90;
export const LEAVES_FRONT_DEPTH = 150;
/** The near strip (z 6): grass and plants in front of the trail that cover the hero's and NPCs' feet. */
export const NEAR_DEPTH = 120;
export const FOREGROUND_DEPTH = 200;
export const SCREEN_FX_DEPTH = 1000;
/** Layers with z at or above this are drawn over the actors (z 6 the near strip, z 7 the foreground). */
export const FOREGROUND_Z = 6;
/** Layers with z at or above this are the out-of-focus foreground, over the falling leaves. */
export const FAR_FOREGROUND_Z = 7;
/** Room for list positions inside a band. */
const BAND = 90;

export const isForeground = (z: number) => z >= FOREGROUND_Z;

/**
 * A layer's depth: z picks the band (behind or in front of the actors), `rank` orders it inside the band.
 */
export function layerDepth(z: number, rank: number): number {
  if (!Number.isInteger(rank) || rank < 0 || rank >= BAND) throw new Error(`Layer rank ${rank} outside its depth band`);
  return (z >= FAR_FOREGROUND_Z ? FOREGROUND_DEPTH : isForeground(z) ? NEAR_DEPTH : 0) + rank;
}

/**
 * One region-wide rank per layer id, so every chunk stacks the same way even when a chunk lists fewer
 * layers (a chunk without sky starts its list at the rear – its list position alone would put the rear
 * under the next chunk's far plate). The chunks' lists are merged: inside a band, an id listed before
 * another in any chunk ranks below it (the authored alpha composition); ties go to lower z, then to the
 * first appearance. Contradicting lists fall back to that tie order.
 */
export function layerRanks(lists: readonly (readonly { id: string; z: number }[])[]): Map<string, number> {
  const z = new Map<string, number>(), seen: string[] = [];
  const after = new Map<string, Set<string>>();
  for (const list of lists) {
    for (const layer of list) if (!z.has(layer.id)) { z.set(layer.id, layer.z); seen.push(layer.id); after.set(layer.id, new Set()); }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (isForeground(list[i].z) === isForeground(list[j].z)) after.get(list[j].id)!.add(list[i].id);
    }
  }
  const tie = (a: string, b: string) => (z.get(a)! - z.get(b)!) || (seen.indexOf(a) - seen.indexOf(b));
  const ranks = new Map<string, number>();
  for (const front of [false, true]) {
    const left = seen.filter(id => isForeground(z.get(id)!) === front);
    let rank = 0;
    while (left.length) {
      left.sort(tie);
      let next = left.findIndex(id => [...after.get(id)!].every(before => ranks.has(before) || !left.includes(before)));
      if (next < 0) next = 0; // a cycle: the lists disagree, z decides
      ranks.set(left[next], rank++);
      left.splice(next, 1);
    }
  }
  return ranks;
}

/** Just above a layer and below the next one in the list – where a reflection on that layer goes. */
export const above = (depth: number) => depth + 0.5;
