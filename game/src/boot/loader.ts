import type Phaser from 'phaser';
import { BOARDS, textureKey, validateAtlas, type AnimationTable } from '../stage/assets';
import { parseCollision, placeCollision, type CollisionChunk } from '../stage/collision';
import { assetFile, parseManifest, stageLayers, type RegionState, type StageManifest } from '../stage/manifest';
import type { RegionJson, StageData } from './contract';
import {
  dataKey, imageWave, jsonWave, MAP_REGIONS, mapStageKey, missingBoards, stageKey, type Entry,
} from './manifest';
import type { LoadTracker } from './progress';

/** A request that has not answered in this long fails (and can be retried); nothing waits forever. */
export const REQUEST_TIMEOUT = 20_000;
/** No byte moved for this long while files are pending: the wave gives up on them. */
export const STALL_TIMEOUT = 25_000;
const JSON_PARALLEL = 6;

/** fetch + JSON with a timeout; a dev server's HTML fallback for a missing file counts as missing. */
export async function fetchJson(request: typeof fetch, url: string, timeout = REQUEST_TIMEOUT): Promise<{ data: unknown; bytes: number }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    let response: Response;
    try { response = await request(url, { signal: abort.signal }); }
    catch (error) { throw new Error(abort.signal.aborted ? 'timed out' : `network error (${(error as Error).message})`); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if ((response.headers?.get('content-type') ?? '').includes('text/html') || /^\s*</.test(text)) throw new Error('HTTP 404');
    try { return { data: JSON.parse(text), bytes: text.length }; }
    catch { throw new Error('invalid JSON'); }
  } finally { clearTimeout(timer); }
}

const plainObject = (value: unknown): value is RegionJson =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The scene surface the loader needs – a subset of Phaser.Scene, so tests can fake it. */
export type LoaderScene = Pick<Phaser.Scene, 'load' | 'textures' | 'cache'>;

/**
 * The one loader. JSON goes through fetch (parallel, timed out, HTML-fallback aware) into the JSON cache;
 * images and atlases through the scene's Phaser loader. Every file reports to the tracker; nothing throws
 * on a missing file – failures are collected for the loading screen to retry or degrade.
 */
export class AssetLoader {
  constructor(private scene: LoaderScene, readonly tracker: LoadTracker,
    private request: typeof fetch = (...args) => fetch(...args)) {}

  has = (key: string) => this.scene.textures.exists(key);

  async run(entries: Entry[]): Promise<void> {
    this.tracker.plan(entries);
    const json = entries.filter(e => e.kind === 'json');
    const images = entries.filter(e => e.kind !== 'json');
    await this.runJson(json);
    await this.runImages(images);
  }

  private async runJson(entries: Entry[]): Promise<void> {
    const queue = entries.filter(entry => {
      if (!this.scene.cache.json.exists(entry.key)) return true;
      this.tracker.skip(entry.key);
      return false;
    });
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        this.tracker.start(entry.key);
        try {
          const { data, bytes } = await fetchJson(this.request, entry.url);
          this.scene.cache.json.add(entry.key, data);
          this.tracker.done(entry.key, bytes);
        } catch (error) { this.tracker.fail(entry.key, (error as Error).message); }
      }
    };
    await Promise.all(Array.from({ length: JSON_PARALLEL }, worker));
  }

  private runImages(entries: Entry[]): Promise<void> {
    const load = this.scene.load;
    const queued = entries.filter(entry => {
      if (this.has(entry.key)) { this.tracker.skip(entry.key); return false; }
      if (entry.kind === 'atlas') {
        const data = entry.atlasJson && this.scene.cache.json.get(entry.atlasJson);
        if (!data) { this.tracker.fail(entry.key, 'no frame data'); return false; }
        load.atlas(entry.key, entry.url, data);
      } else load.image(entry.key, entry.url);
      return true;
    });
    if (!queued.length) return Promise.resolve();
    const keys = new Set(queued.map(e => e.key));
    return new Promise(resolve => {
      const progress = (file: Phaser.Loader.File) => {
        if (!keys.has(file.key)) return;
        if (this.tracker.status(file.key) === 'queued') this.tracker.start(file.key);
        this.tracker.bytes(file.key, file.bytesLoaded, file.bytesTotal);
      };
      const complete = (key: string) => { if (keys.has(key) && this.has(key)) this.tracker.done(key); };
      const error = (file: Phaser.Loader.File) => {
        if (keys.has(file.key)) this.tracker.fail(file.key, file.xhrLoader?.status ? `HTTP ${file.xhrLoader.status}` : 'failed to load');
      };
      let watchdog: ReturnType<typeof setInterval> | undefined;
      const finish = () => {
        clearInterval(watchdog);
        load.off('fileprogress', progress).off('filecomplete', complete).off('loaderror', error).off('complete', finish);
        for (const key of keys) {
          const status = this.tracker.status(key);
          if (this.has(key)) { if (status !== 'done') this.tracker.done(key); }
          else if (status !== 'failed') this.tracker.fail(key, 'no response');
        }
        resolve();
      };
      load.on('fileprogress', progress).on('filecomplete', complete).on('loaderror', error).once('complete', finish);
      // A request the browser never answers must not hold the game: give up on the wave and offer a retry.
      watchdog = setInterval(() => { if (this.tracker.stalled(STALL_TIMEOUT)) { load.reset(); finish(); } }, 1000);
      load.start();
    });
  }

  /**
   * Load a region: wave 1 (stage.json, atmosphere, surfaces, board JSON), validate, wave 2 (collision, plates,
   * board sheets). `first` adds every region's stage.json for the map and the optional menu key art.
   * Returns the parsed manifest, or undefined when stage.json itself failed.
   */
  async region(region: string, state: RegionState, first: boolean): Promise<StageManifest | undefined> {
    if (!/^[a-z][a-z0-9-]*$/.test(region)) throw new Error(`Invalid region id ${region}`);
    const boards = missingBoards(this.has);
    const [stage, ...json] = jsonWave(region, { boards, mapRegions: first ? MAP_REGIONS : [] });
    // stage.json first (a few KB): it names the plates, so the whole plan – and an honest total – is known
    // before the first big file starts.
    this.tracker.plan([stage, ...json]);
    await this.run([stage]);
    const manifest = this.manifest(region, state);
    // The region's JSON (atmosphere.json names extra images) lands before wave 2 is planned.
    await this.run(json);
    const listed = (this.regionJson(region, 'atmosphere') as { assets?: unknown }).assets;
    const assets = Array.isArray(listed) ? listed.filter((file): file is string => typeof file === 'string') : [];
    const images = manifest ? imageWave(manifest, state, { boards, has: this.has, menuKey: first, assets }) : [];
    this.tracker.plan(images);
    const invalid = new Set(boards.filter(board => !this.checkAtlas(board)));
    for (const board of invalid) this.tracker.fail(board, 'no valid atlas JSON');
    await this.run(images.filter(entry => !invalid.has(entry.key)));
    return manifest;
  }

  /** Validate a board's frames against its clips; a bad pair is a failure (retry refetches it). */
  private checkAtlas(board: string): boolean {
    const atlas = this.scene.cache.json.get(`atlas:${board}`), clips = this.scene.cache.json.get(`${board}.anims`);
    if (!atlas || !clips) return false;
    try { validateAtlas(board, atlas, clips); return true; }
    catch (error) {
      this.scene.cache.json.remove(`atlas:${board}`);
      this.scene.cache.json.remove(`${board}.anims`);
      this.tracker.fail(`atlas:${board}`, (error as Error).message);
      return false;
    }
  }

  private manifest(region: string, state: RegionState): StageManifest | undefined {
    const raw = this.scene.cache.json.get(stageKey(region));
    if (raw === undefined) return undefined;
    try {
      const manifest = parseManifest(raw);
      if (manifest.region !== region) throw new Error(`region mismatch (${manifest.region})`);
      stageLayers(manifest, state);
      if (!this.scene.cache.json.exists(mapStageKey(region))) this.scene.cache.json.add(mapStageKey(region), raw);
      return manifest;
    } catch (error) {
      this.scene.cache.json.remove(stageKey(region));
      this.tracker.fail(stageKey(region), (error as Error).message);
      return undefined;
    }
  }

  /** Collision chunks from the cache; an invalid file is reported, never thrown. */
  collisions(manifest: StageManifest, state: RegionState): CollisionChunk[] {
    return manifest.chunks.flatMap(chunk => {
      const file = chunk.states[state]?.collision;
      if (!assetFile(file)) return [];
      const key = `collision:${manifest.region}:${file}`;
      const raw = this.scene.cache.json.get(key);
      if (raw === undefined) return [];
      try {
        return [placeCollision(parseCollision(raw, chunk.id, state), [chunk.x * manifest.chunkSize[0], chunk.y * manifest.chunkSize[1]])];
      } catch (error) {
        this.scene.cache.json.remove(key);
        this.tracker.fail(key, (error as Error).message);
        return [];
      }
    });
  }

  /** An optional region file as a plain object, `{}` when absent or not an object. */
  regionJson(region: string, file: 'atmosphere' | 'surfaces'): RegionJson {
    const raw = this.scene.cache.json.get(dataKey(region, file));
    return plainObject(raw) ? raw : {};
  }

  /**
   * Degrade after failures the player chose to (or production did) continue past: bundled placeholder atlases
   * for boards, a flat plate for stage images, a one-plate stage for a missing manifest.
   */
  async degrade(region: string, state: RegionState, manifest: StageManifest | undefined): Promise<StageManifest> {
    const stage = manifest ?? fallbackManifest(region, state);
    for (const board of BOARDS.filter(b => !this.has(b))) {
      const fallback = board.startsWith('enemy-') ? board.slice(6) : board === 'fx' || board.startsWith('dexter') ? 'dexter'
        : board.startsWith('boss-jenny') ? 'jenny' : 'hero';
      try {
        const { data: atlas } = await fetchJson(this.request, `/assets/placeholder/${fallback}.json`);
        const { data: clips } = await fetchJson(this.request, `/assets/placeholder/${fallback}.anims.json`);
        this.scene.cache.json.remove(`atlas:${board}`); this.scene.cache.json.add(`atlas:${board}`, atlas);
        this.scene.cache.json.remove(`${board}.anims`); this.scene.cache.json.add(`${board}.anims`, clips);
        await this.runImages([{ key: board, url: `/assets/placeholder/${fallback}.png`, kind: 'atlas', atlasJson: `atlas:${board}` }]);
      } catch (error) { console.error(`[loader] no placeholder for ${board}`, error); }
    }
    for (const layer of stageLayers(stage, state)) {
      const key = textureKey(region, layer.file);
      if (this.has(key)) continue;
      const texture = this.scene.textures.createCanvas(key, ...stage.chunkSize);
      if (texture) { texture.context.fillStyle = '#76516f'; texture.context.fillRect(0, 0, ...stage.chunkSize); texture.refresh(); }
    }
    return stage;
  }

  /** Everything Stage needs for this region, from the caches. */
  stageData(manifest: StageManifest, state: RegionState, spawn?: StageData['spawn']): StageData {
    return {
      manifest, state, spawn,
      collisions: manifest.chunks[0]?.id === 'fallback' ? [] : this.collisions(manifest, state),
      atmosphere: this.regionJson(manifest.region, 'atmosphere'),
      surfaces: this.regionJson(manifest.region, 'surfaces'),
    };
  }

  clips(board: string): AnimationTable | undefined { return this.scene.cache.json.get(`${board}.anims`); }
}

export function fallbackManifest(region: string, state: RegionState): StageManifest {
  return { region, chunkSize: [2160, 720], chunks: [{ id: 'fallback', x: 0, y: 0,
    states: { [state]: { layers: [{ id: 'missing-stage', z: 5, scroll: 1, file: 'missing.png' }], collision: null } } }] };
}
