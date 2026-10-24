import { BOARDS, stageBase, textureKey } from '../stage/assets';
import { assetFile, stageLayers, type RegionState, type StageManifest } from '../stage/manifest';
import { REGION_ORDER } from '../ui/mapModel';

/**
 * The asset manifest: every file the game loads, in one place. Boot and Preload are the only scenes that load;
 * story, UI and FX scenes read what is already in the texture and JSON caches.
 *
 * Files are planned in two waves – JSON first (the stage manifest names the plates and collision files), then
 * images – and each entry says whether the game can run without it (`optional`: missing → `{}` or nothing).
 */
export type EntryKind = 'json' | 'image' | 'atlas';
export interface Entry {
  /** Unique id; for images and atlases also the Phaser texture key, for JSON the JSON-cache key. */
  key: string;
  url: string;
  kind: EntryKind;
  optional?: boolean;
  /** Atlas only: the URL of the frame JSON (already fetched in wave 1, cache key `atlas:<board>`). */
  atlasJson?: string;
}

/** The approved UI atlas and its layout (#127) – Boot loads them so the loading screen can use them. */
export const UI_ATLAS_KEY = 'ui';
export const UI_LAYOUT_KEY = 'ui-layout';
/** Optional menu key art (workstream 5). Without it the menu shows the live garden only. */
export const MENU_KEY = 'menu-key';

export const bootEntries = (): Entry[] => [
  { key: 'atlas:ui', url: '/assets/ui/ui.json', kind: 'json', optional: true },
  { key: UI_LAYOUT_KEY, url: '/assets/ui/ui-layout.json', kind: 'json', optional: true },
];
export const uiAtlasEntry = (): Entry =>
  ({ key: UI_ATLAS_KEY, url: '/assets/ui/ui.png', kind: 'atlas', optional: true, atlasJson: 'atlas:ui' });

/** Per-region data files beside stage.json; the two optional ones belong to workstreams 2 and 3. */
export const REGION_DATA = { atmosphere: 'atmosphere.json', surfaces: 'surfaces.json' } as const;
export const stageKey = (region: string) => `stage:${region}`;
export const dataKey = (region: string, file: keyof typeof REGION_DATA) => `${file}:${region}`;
/** PocketComputer reads every region's stage.json from these cache keys (its own preload then has nothing to do). */
export const mapStageKey = (region: string) => `map-stage-${region}`;

/** Wave 1 for a region: its stage manifest, the optional data files, and (first load) every board's JSON. */
export function jsonWave(region: string, opts: { boards: readonly string[]; mapRegions: readonly string[] }): Entry[] {
  const base = stageBase(region);
  return [
    { key: stageKey(region), url: `${base}stage.json`, kind: 'json' },
    { key: dataKey(region, 'atmosphere'), url: base + REGION_DATA.atmosphere, kind: 'json', optional: true },
    { key: dataKey(region, 'surfaces'), url: base + REGION_DATA.surfaces, kind: 'json', optional: true },
    ...opts.mapRegions.filter(r => r !== region).map(r => ({ key: mapStageKey(r), url: `${stageBase(r)}stage.json`, kind: 'json' as const, optional: true })),
    ...opts.boards.flatMap(board => [
      { key: `atlas:${board}`, url: `/assets/sprites/${board}.json`, kind: 'json' as const },
      { key: `${board}.anims`, url: `/assets/sprites/${board}.anims.json`, kind: 'json' as const },
    ]),
  ];
}

/** Wave 2 for a region: collision files, every stage plate not yet in the texture cache, and the boards' sheets. */
export function imageWave(manifest: StageManifest, state: RegionState, opts: {
  boards: readonly string[]; has: (key: string) => boolean; menuKey?: boolean;
}): Entry[] {
  const region = manifest.region, base = stageBase(region);
  const collisions = manifest.chunks.flatMap(chunk => {
    const file = chunk.states[state]?.collision;
    return assetFile(file) ? [{ key: `collision:${region}:${file}`, url: base + file, kind: 'json' as const }] : [];
  });
  const plates = [...new Set(stageLayers(manifest, state).map(layer => layer.file))]
    .filter(file => !opts.has(textureKey(region, file)))
    .map(file => ({ key: textureKey(region, file), url: base + file, kind: 'image' as const }));
  const boards = opts.boards.filter(board => !opts.has(board))
    .map(board => ({ key: board, url: `/assets/sprites/${board}.png`, kind: 'atlas' as const, atlasJson: `atlas:${board}` }));
  const menu = opts.menuKey && !opts.has(MENU_KEY)
    ? [{ key: MENU_KEY, url: `/assets/ui/${MENU_KEY}.png`, kind: 'image' as const, optional: true }] : [];
  return [...collisions, ...plates, ...boards, ...menu];
}

/** The boards still missing from the texture cache (a region swap reloads none of them). */
export const missingBoards = (has: (key: string) => boolean) => BOARDS.filter(board => !has(board));
export const MAP_REGIONS: readonly string[] = REGION_ORDER;
