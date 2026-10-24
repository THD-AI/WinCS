/**
 * Dexter watching from too far away (docs/03 region 1 beat 1, #160): after the 404 the hero lands alone in clean
 * Rusty Creek, but far down the path – where Jenny will come from – a small black plush stands and watches. He
 * never comes closer. When the hero gets near he turns and hops off, and the silence before Jenny begins.
 */
export const WATCH = {
  /** How far past the ram trigger he stands, on its path (px). */
  beyond: 240,
  /** He leaves once the hero is this close (px, about 8 m). */
  leaveAt: 360,
  /** The hop off: distance (px) and seconds. */
  hop: 220, hopSeconds: 0.9,
} as const;

export type WatchPhase = 'watch' | 'leave' | 'gone';

/** Pure: where the watcher is in his beat, `since` seconds after he started leaving (if he has). */
export function watchPhase(heroX: number, dexterX: number, since: number | undefined): WatchPhase {
  if (since === undefined) return dexterX - heroX > WATCH.leaveAt ? 'watch' : 'leave';
  return since < WATCH.hopSeconds ? 'leave' : 'gone';
}
