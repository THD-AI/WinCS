import type { CollisionChunk, Geometry } from './collision';
import type { RegionTarget } from './swap';

/**
 * Debug teleport (the menu's Debug tab, docs/02 "Menu and debug mode"): every place worth jumping to in the loaded
 * region, read from its collision data – the start, the coffee machines (save points), Jenny's gate, the pond's
 * 404, doors and chunk exits, and each chunk's left edge – and the slice's levels in story order. Pure: the stage
 * moves the hero (Player.travel) and swaps the region (swapRegion).
 */
export interface Spot { label: string; x: number; y: number }

/** The slice's levels in story order: the garden's prologue, clean Rusty Creek, the rust maze (docs/03). */
export const LEVELS: readonly (RegionTarget & { label: string })[] = [
  { label: 'Hidden Garden', region: 'hidden-garden', state: 'clean' },
  { label: 'Rusty Creek (clean)', region: 'rusty-creek', state: 'clean' },
  { label: 'Rust maze (anomaly)', region: 'rusty-creek', state: 'anomaly' },
];

const NAMED: Record<string, string> = {
  'coffee-machine': 'Coffee machine (save)',
  'boss-gate': "Jenny's gate",
  anomaly: 'The pond (404)',
  'chunk-exit': 'Chunk exit',
};

/** The places in a region, row by row (rooms), left to right; feet on the floor under each place. */
export function spots(chunks: Pick<CollisionChunk, 'local' | 'world'>[]): Spot[] {
  const out: Spot[] = [];
  for (const { local, world } of chunks) {
    for (const p of world.spawn) if (p.kind === 'player') out.push({ label: 'Start', x: p.x, y: p.y });
    for (const box of world.interact) {
      const name = box.kind === 'door' ? `Door: ${box.id}` : NAMED[box.kind ?? ''];
      if (name) out.push({ label: name, x: Math.round(box.x + box.w / 2), y: box.y + box.h });
    }
    const edge = leftEdge(world);
    if (edge) out.push({ label: `Chunk ${local.chunk}`, ...edge });
  }
  return out.sort((a, b) => Math.floor(a.y / 720) - Math.floor(b.y / 720) || a.x - b.x);
}

/** Where to stand at a chunk's left: the walk line that starts furthest left, 40 px in. */
function leftEdge(world: Geometry): { x: number; y: number } | undefined {
  const line = [...world.walk].sort((a, b) => a[0][0] - b[0][0])[0];
  return line && { x: line[0][0] + 40, y: line[0][1] };
}

/** The next place to the right of the hero (dir 1) or left (dir -1) in his row; none past the last. */
export function nextSpot(all: Spot[], hero: { x: number; y: number }, dir: 1 | -1): Spot | undefined {
  const row = Math.floor(hero.y / 720);
  const here = all.filter(s => Math.floor(s.y / 720) === row && (dir > 0 ? s.x > hero.x + 40 : s.x < hero.x - 40));
  return dir > 0 ? here[0] : here[here.length - 1];
}

/** The level after the one that is loaded (wrapping to the first). */
export function nextLevel(current: { region: string; state: string }): RegionTarget {
  const i = LEVELS.findIndex(l => l.region === current.region && l.state === current.state);
  const next = LEVELS[(i + 1) % LEVELS.length];
  return { region: next.region, state: next.state };
}
