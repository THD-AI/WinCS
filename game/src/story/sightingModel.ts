import type { CollisionChunk, Marker } from '../stage/collision';

/**
 * Dexter in the rooms (docs/09 "World pipeline", the Hidden Garden's underground): while the plush waits for you at
 * the pond above, he is also down here – one sighting per room, wordless (docs/03: he acts, never speaks). He stands
 * there when you come in, beckons or just waits, and when you come close he is not there any more: a two-frame
 * flicker, then gone for good until the region loads again. The markers are `spawn` kind `dexter-sighting` with an
 * `act` and a `face` (1 right, -1 left); the anomaly state has none (Dexter is gone there).
 */
export const SIGHTING = {
  /** He is gone once the hero is this close (px), in his room. */
  near: 300,
  /** The flicker before he is gone (s). */
  flicker: 0.12,
} as const;
const ROW = 720;

export type SightingPhase = 'there' | 'flicker' | 'gone';

/** Pure: one sighting's phase, given the hero and the seconds since he started to go (if he has). */
export function sightingPhase(hero: { x: number; y: number }, at: { x: number; y: number }, since: number | undefined): SightingPhase {
  if (since !== undefined) return since < SIGHTING.flicker ? 'flicker' : 'gone';
  const sameRoom = Math.floor(hero.y / ROW) === Math.floor((at.y - 1) / ROW);
  return sameRoom && Math.abs(hero.x - at.x) < SIGHTING.near ? 'flicker' : 'there';
}

/** The sightings among a region's spawn markers. */
export const sightingMarkers = (chunks: Pick<CollisionChunk, 'world'>[]): Marker[] =>
  chunks.flatMap(chunk => chunk.world.spawn).filter(m => m.kind === 'dexter-sighting');
