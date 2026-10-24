import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { Assets } from './assets';
import { parseManifest, stageLayers } from './manifest';

const manifest = () => ({ region: 'rusty-creek', chunkSize: [2160, 720],
  chunks: [0, 1, 2].map(x => ({ id: `rc-${x}-0`, x, y: 0, states: { anomaly: {
    layers: [1, 2, 3, 5, 6, 7, 4].map((z, n) => ({ id: `layer-${n}`, z,
      scroll: z === 1 ? 0.2 : z === 7 ? 1.15 : 1, file: z === 1 ? 'shared.png' : `${x}-${z}.png` })),
    collision: `rc-${x}-0.anomaly.collision.json` } } })) });
const clips = { idle: { frames: 1, fps: 12, loop: true } };
const atlas = { frames: { 'idle-00': { frame: { x: 0, y: 0, w: 28, h: 80 }, pivot: { x: 0.5, y: 1 } } } };

function harness(missing = '') {
  const textures = new Set<string>(), queued: string[] = [];
  const complete: (() => void)[] = [];
  const image = vi.fn((key: string) => queued.push(key));
  const loadAtlas = vi.fn((key: string) => queued.push(key));
  const scene = { load: { image, atlas: loadAtlas, on: vi.fn(), off: vi.fn(),
    once: (_: string, fn: () => void) => complete.push(fn),
    start: () => { queued.splice(0).forEach(key => textures.add(key)); complete.shift()?.(); } },
    textures: { exists: (key: string) => textures.has(key), remove: (key: string) => textures.delete(key) },
    cache: { json: { add: vi.fn(), get: () => clips } } };
  const request = vi.fn(async (url: string | URL | Request) => ({ ok: !String(url).includes(missing || '\0'), status: 404,
    json: async () => String(url).endsWith('stage.json') ? manifest() : String(url).endsWith('anims.json') ? clips : atlas }));
  return { scene: scene as unknown as Phaser.Scene, request: request as unknown as typeof fetch, image, loadAtlas };
}

describe('stage manifest', () => {
  it('keeps all 21 layers in blend order, offsets chunks and preserves scroll', () => {
    const layers = stageLayers(parseManifest(manifest()), 'anomaly');
    expect(layers).toHaveLength(21);
    expect(layers.slice(0, 7).map(l => l.z)).toEqual([1, 2, 3, 5, 6, 7, 4]);
    expect(layers[7].x).toBe(2160); expect(layers[14].x).toBe(4320);
    expect(layers[0].scroll).toBe(0.2); expect(layers[5].scroll).toBe(1.15);
  });
  it('handles negative grid rows and rejects missing states', () => {
    const input = manifest(); input.chunks[0].y = -1;
    const stage = parseManifest(input);
    expect(stageLayers(stage, 'anomaly')[0].y).toBe(-720);
    expect(() => stageLayers(stage, 'clean')).toThrow('Missing');
  });
  it('rejects duplicate cells and unsafe file paths', () => {
    const input = manifest(); input.chunks[1].x = 0;
    expect(() => parseManifest(input)).toThrow('duplicate grid');
    input.chunks[1].x = 1; input.chunks[0].states.anomaly.layers[0].file = '../private.png';
    expect(() => parseManifest(input)).toThrow('layer id/file');
  });
});

describe('asset loading', () => {
  it('loads an intentional pending-art placeholder without requesting a missing real board', async () => {
    const h = harness('/sprites/');
    expect(await new Assets(h.scene, true, h.request).placeholder('coffee-placeholder')).toEqual(clips);
    expect(h.loadAtlas).toHaveBeenCalledWith('coffee-placeholder', '/assets/placeholder/hero.png', atlas);
  });
  it('does not bind the native browser fetch receiver to the asset loader', async () => {
    const h = harness();
    vi.stubGlobal('fetch', function(this: unknown, ...args: Parameters<typeof fetch>) {
      expect(this).not.toBeInstanceOf(Assets);
      return h.request(...args);
    });
    try { await new Assets(h.scene, true).board('hero-move'); }
    finally { vi.unstubAllGlobals(); }
  });
  it('loads shared stage plates once and reuses already loaded textures', async () => {
    const h = harness(), assets = new Assets(h.scene, true, h.request);
    await assets.stage('rusty-creek', 'anomaly');
    expect(h.image).toHaveBeenCalledTimes(19);
    await assets.stage('rusty-creek', 'anomaly');
    expect(h.image).toHaveBeenCalledTimes(19);
  });
  it('loads any named production board using the exporter contract', async () => {
    const h = harness();
    expect(await new Assets(h.scene, true, h.request).board('hero-move')).toEqual(clips);
    expect(h.loadAtlas).toHaveBeenCalledWith('hero-move', '/assets/sprites/hero-move.png', atlas);
    expect(h.scene.cache.json.add).toHaveBeenCalledWith('hero-move.anims', clips);
  });
  it('rejects missing assets loudly in development', async () => {
    const h = harness('/sprites/');
    await expect(new Assets(h.scene, true, h.request).board('hero-move')).rejects.toThrow('Missing asset');
    expect(h.loadAtlas).not.toHaveBeenCalled();
  });
  it('rejects a missing stage manifest in development', async () => {
    const h = harness('stage.json');
    await expect(new Assets(h.scene, true, h.request).stage('rusty-creek', 'anomaly'))
      .rejects.toThrow('/assets/stages/rusty-creek/stage.json');
  });
  it('provides a stage plate when the production manifest is missing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = harness('stage.json');
      const stage = await new Assets(h.scene, false, h.request).stage('rusty-creek', 'anomaly');
      expect(stageLayers(stage, 'anomaly')[0].file).toBe('missing.png');
      expect(h.image).toHaveBeenCalledWith('rusty-creek:missing.png', '/assets/stages/rusty-creek/missing.png');
    } finally { log.mockRestore(); }
  });
  it('uses a bundled placeholder only after a production board fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = harness('/sprites/');
      await new Assets(h.scene, false, h.request).board('enemy-rover');
      expect(h.loadAtlas).toHaveBeenCalledWith('enemy-rover', '/assets/placeholder/rover.png', atlas);
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
