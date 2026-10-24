import type { Position } from '../core/events';
import type { CollisionChunk } from '../stage/collision';
import type { RegionState, StageManifest } from '../stage/manifest';

/** A region's optional JSON data (atmosphere.json, surfaces.json): `{}` when the file is absent. */
export type RegionJson = Record<string, unknown>;

/**
 * What Preload hands to `Stage` (and, on the first load, to `Title`). Workstreams 2 and 3 parse `atmosphere`
 * and `surfaces` themselves; the loader only guarantees a plain object.
 */
export interface StageData {
  manifest: StageManifest;
  state: RegionState;
  collisions: CollisionChunk[];
  atmosphere: RegionJson;
  surfaces: RegionJson;
  spawn?: Position;
}

/** What Preload accepts: from `swapRegion` (stage/swap.ts) or empty on boot (the URL picks the region). */
export interface PreloadData { region?: string; state?: RegionState; spawn?: Position }
