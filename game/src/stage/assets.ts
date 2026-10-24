import type Phaser from 'phaser';
import { parseManifest, stageLayers, type StageManifest, type RegionState } from './manifest';

import boards from './boards.json';

/** Every atlas the game needs – data in boards.json, one line per board. */
export const BOARDS: readonly string[] = boards.required;
/** Atlases the game uses when they exist (not exported yet → simply absent, no placeholder, no error). */
export const OPTIONAL_BOARDS: readonly string[] = boards.optional;
/** `stride`: a locomotion cycle's stride in game px (compare.py stride) – it is played by distance, not by time. */
export interface AnimationClip { frames: number; fps: number; loop: boolean; stride?: number }
export type AnimationTable = Record<string, AnimationClip>;
export const stageBase = (region: string) => `/assets/stages/${region}/`;
export const textureKey = (region: string, file: string) => `${region}:${file}`;

/** The exporter contract (scripts/export_atlas.py): every clip's frames `<clip>-NN` exist in the atlas. */
export function validateAtlas(board: string, atlas: unknown, table: unknown): AnimationTable {
  const frames = (atlas as { frames?: Record<string, unknown> } | null)?.frames;
  const clips = table as AnimationTable | null;
  if (!frames || !clips || typeof clips !== 'object' || !Object.keys(clips).length) throw new Error(`Invalid atlas ${board}`);
  for (const [name, clip] of Object.entries(clips)) {
    if (!Number.isInteger(clip.frames) || clip.frames < 1 || !Number.isFinite(clip.fps)
      || clip.fps <= 0 || typeof clip.loop !== 'boolean') throw new Error(`Invalid clip ${board}:${name}`);
    for (let n = 0; n < clip.frames; n++) if (!frames[`${name}-${String(n).padStart(2, '0')}`]) {
      throw new Error(`Missing frame ${board}:${name}-${n}`);
    }
  }
  return clips;
}

/**
 * Ad-hoc loading for tools and tests. The game loads through `boot/loader.ts` (Boot and Preload only), which
 * shares this file's BOARDS, keys and atlas validation.
 */
export class Assets {
  constructor(private scene: Phaser.Scene, private strict = import.meta.env.DEV,
    private request: typeof fetch = (...args) => fetch(...args)) {}

  private async json(url: string): Promise<unknown> {
    const response = await this.request(url);
    if (!response.ok) throw new Error(`Missing asset ${url}: HTTP ${response.status}`);
    return response.json();
  }

  private queue(add: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const errors: string[] = [];
      const failed = (file: Phaser.Loader.File) => errors.push(file.key);
      this.scene.load.on('loaderror', failed);
      this.scene.load.once('complete', () => {
        this.scene.load.off('loaderror', failed);
        errors.length ? reject(new Error(`Failed assets: ${errors.join(', ')}`)) : resolve();
      });
      add();
      this.scene.load.start();
    });
  }

  async stage(region: string, state: RegionState): Promise<StageManifest> {
    if (!/^[a-z][a-z0-9-]*$/.test(region)) throw new Error('Invalid region id');
    let manifest: StageManifest;
    try {
      manifest = parseManifest(await this.json(`${stageBase(region)}stage.json`));
      if (manifest.region !== region) throw new Error(`Region mismatch: ${region}`);
      stageLayers(manifest, state);
    } catch (error) {
      if (this.strict) throw error;
      console.error(error);
      manifest = { region, chunkSize: [2160, 720], chunks: [{ id: 'fallback', x: 0, y: 0,
        states: { [state]: { layers: [{ id: 'missing-stage', z: 5, scroll: 1, file: 'missing.png' }], collision: null } } }] };
    }
    const files = [...new Set(stageLayers(manifest, state).map(layer => layer.file))];
    const missing = files.filter(file => !this.scene.textures.exists(textureKey(region, file)));
    if (missing.length) {
      try {
        await this.queue(() => missing.forEach(file => this.scene.load.image(textureKey(region, file), stageBase(region) + file)));
      } catch (error) {
        if (this.strict) throw error;
        console.error(error);
        for (const file of missing) if (!this.scene.textures.exists(textureKey(region, file))) {
          const texture = this.scene.textures.createCanvas(textureKey(region, file), ...manifest.chunkSize);
          if (texture) { texture.context.fillStyle = '#76516f'; texture.context.fillRect(0, 0, ...manifest.chunkSize); texture.refresh(); }
        }
      }
    }
    return manifest;
  }

  private async atlas(board: string, base: string): Promise<AnimationTable> {
    const atlas = await this.json(`${base}.json`);
    const clips = validateAtlas(board, atlas, await this.json(`${base}.anims.json`));
    await this.queue(() => this.scene.load.atlas(board, `${base}.png`, atlas as object));
    this.scene.cache.json.add(`${board}.anims`, clips);
    return clips;
  }

  async board(board: string): Promise<AnimationTable> {
    if (!/^[a-z][a-z0-9-]*$/.test(board)) throw new Error('Invalid board id');
    if (this.scene.textures.exists(board)) return this.scene.cache.json.get(`${board}.anims`);
    try { return await this.atlas(board, `/assets/sprites/${board}`); }
    catch (error) {
      if (this.strict) throw error;
      console.error(error);
      const fallback = board.startsWith('enemy-') ? board.slice(6) : board === 'fx' ? 'dexter' : 'hero';
      if (this.scene.textures.exists(board)) this.scene.textures.remove(board);
      return this.atlas(board, `/assets/placeholder/${fallback}`);
    }
  }

  /** Intentional pending-art placeholder; never request an unexported board. */
  async placeholder(key: string): Promise<AnimationTable> {
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error('Invalid placeholder id');
    if (this.scene.textures.exists(key)) return this.scene.cache.json.get(`${key}.anims`);
    return this.atlas(key, '/assets/placeholder/hero');
  }
}
