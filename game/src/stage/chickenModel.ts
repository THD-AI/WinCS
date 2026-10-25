import type { Box, CollisionChunk } from './collision';

/**
 * The rubber chicken (playtest T2, a jam requirement): a secret, lost behind the Hidden Garden's gate pillar, left
 * of where you start. It is an `interact` box of kind `rubber-chicken`; walking into it squeezes it – the squeak
 * and its squeezed frame – every time. Nothing else: no pickup, no words.
 */
export const SQUEEZE_MS = 260;

/** The chicken boxes of a region. */
export const chickens = (chunks: Pick<CollisionChunk, 'world'>[]): Box[] =>
  chunks.flatMap(chunk => chunk.world.interact).filter(box => box.kind === 'rubber-chicken');

/** Which frame shows, `since` ms after the last squeeze (undefined: never squeezed). */
export const chickenFrame = (since: number | undefined) => since !== undefined && since < SQUEEZE_MS ? 'squeak-00' : 'rest-00';
