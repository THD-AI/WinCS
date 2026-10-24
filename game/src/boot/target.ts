import type { RegionState } from '../stage/manifest';
import { START } from '../stage/swap';
import type { PreloadData } from './contract';
import type { FileState } from './progress';

/** Resolve the region to load: swapRegion's data first, then `?region=…&state=…`, then the slice start. */
export function resolveTarget(data: PreloadData, search: string): { region: string; state: RegionState; first: boolean } {
  const query = new URLSearchParams(search);
  const first = !data.region;
  const region = data.region ?? query.get('region') ?? START.region;
  const asked = data.state ?? query.get('state');
  const state: RegionState = asked === 'clean' || asked === 'anomaly' ? asked : region === START.region ? START.state : 'anomaly';
  return { region, state, first };
}

/** The boot-log line for a file that finished or failed. */
export function logLine(file: FileState): string | undefined {
  const path = file.entry.url.split('/').pop() ?? file.entry.url;
  if (file.status === 'done') return `LOAD ${path} OK`;
  if (file.status === 'failed') return file.entry.optional ? `SKIP ${path} (NONE)` : `FAIL ${path} (${file.reason})`;
  return undefined;
}
