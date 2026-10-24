import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { BOARDS, OPTIONAL_BOARDS } from '../stage/assets';
import { AssetLoader, fetchJson } from './loader';
import { imageWave, jsonWave, MENU_KEY } from './manifest';
import { LoadTracker } from './progress';
import { logLine, resolveTarget } from './target';

const stage = (region = 'hidden-garden') => ({ region, chunkSize: [2160, 720], chunks: [0, 1].map(x => ({
  id: `c-${x}`, x, y: 0, states: { clean: { layers: [
    { id: 'sky', z: 0, scroll: 0.1, file: 'sky.png' }, { id: 'play', z: 5, scroll: 1, file: `${x}-play.png` }],
  collision: `c-${x}.clean.collision.json` } } })) });
const collision = (chunk: string) => ({ chunk, state: 'clean', size: [2160, 720], walk: [[[0, 500], [2160, 500]]],
  slide: [], oneWay: [], climb: [], solid: [], noGo: [], hazard: [], interact: [], glideLift: [],
  spawn: [{ id: 'player', kind: 'player', x: 120, y: 500 }], ledge: [] });
const atlas = { frames: { 'idle-00': { frame: { x: 0, y: 0, w: 8, h: 8 } } } };
const clips = { idle: { frames: 1, fps: 12, loop: true } };

/** A fake scene: JSON cache, texture set, and a Phaser-like loader that "loads" every queued file unless it is listed as broken. */
function harness(opts: { missing?: string[]; brokenImages?: string[] } = {}) {
  const textures = new Set<string>(), json = new Map<string, unknown>();
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  let queue: { key: string }[] = [];
  const emit = (event: string, ...args: unknown[]) => [...(listeners.get(event) ?? [])].forEach(fn => fn(...args));
  const load = {
    image: vi.fn((key: string) => queue.push({ key })),
    atlas: vi.fn((key: string) => queue.push({ key })),
    on(event: string, fn: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); return load; },
    once(event: string, fn: (...args: unknown[]) => void) { return load.on(event, fn); },
    off(event: string, fn: (...args: unknown[]) => void) { listeners.set(event, (listeners.get(event) ?? []).filter(f => f !== fn)); return load; },
    reset: vi.fn(),
    start() {
      const files = queue; queue = [];
      for (const file of files) {
        if (opts.brokenImages?.includes(file.key)) { emit('loaderror', { key: file.key, xhrLoader: { status: 404 } }); continue; }
        emit('fileprogress', { key: file.key, bytesLoaded: 1000, bytesTotal: 1000 });
        textures.add(file.key); emit('filecomplete', file.key);
      }
      emit('complete');
    },
  };
  const scene = {
    load, textures: { exists: (k: string) => textures.has(k), createCanvas: vi.fn((k: string) => { textures.add(k); return { context: { fillRect() {}, set fillStyle(_: string) {} }, refresh() {} }; }) },
    cache: { json: { exists: (k: string) => json.has(k), add: (k: string, v: unknown) => json.set(k, v), get: (k: string) => json.get(k), remove: (k: string) => json.delete(k) } },
  };
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const missing = opts.missing?.some(m => url.includes(m));
    const body = url.endsWith('stage.json') ? stage(url.split('/')[3])
      : url.endsWith('.collision.json') ? collision(url.split('/').pop()!.split('.')[0])
        : url.endsWith('.anims.json') ? clips : url.includes('/sprites/') || url.includes('/placeholder/') ? atlas : { wind: 1 };
    return { ok: !missing, status: missing ? 404 : 200, headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify(body) } as unknown as Response;
  });
  const tracker = new LoadTracker();
  return { scene: scene as unknown as Phaser.Scene, request: request as unknown as typeof fetch, tracker, textures, json, load,
    loader: new AssetLoader(scene as unknown as Phaser.Scene, tracker, request as unknown as typeof fetch) };
}

describe('manifest', () => {
  it('plans every board, the region data and the map stages in wave 1', () => {
    const keys = jsonWave('hidden-garden', { boards: BOARDS, mapRegions: ['hidden-garden', 'rusty-creek'] }).map(e => e.key);
    expect(keys.slice(0, 4)).toEqual(['stage:hidden-garden', 'atmosphere:hidden-garden', 'surfaces:hidden-garden', 'map-stage-rusty-creek']);
    expect(keys).toContain('atlas:fx-leaves');
    expect(keys).toContain('hero-move.anims');
  });
  it('marks optional boards, region data and key art as optional', () => {
    const wave = jsonWave('hidden-garden', { boards: OPTIONAL_BOARDS, mapRegions: [] });
    expect(wave.filter(e => e.optional).map(e => e.key)).toEqual(['atmosphere:hidden-garden', 'surfaces:hidden-garden',
      ...OPTIONAL_BOARDS.flatMap(b => [`atlas:${b}`, `${b}.anims`])]);
  });
  it('plans shared plates once and skips textures already loaded', () => {
    const manifest = stage() as never;
    const keys = imageWave(manifest, 'clean', { boards: ['hero-move'], has: k => k === 'hidden-garden:0-play.png', menuKey: true }).map(e => e.key);
    expect(keys).toEqual(['collision:hidden-garden:c-0.clean.collision.json', 'collision:hidden-garden:c-1.clean.collision.json',
      'hidden-garden:sky.png', 'hidden-garden:1-play.png', 'hero-move', MENU_KEY]);
    const extra = imageWave(manifest, 'clean', { boards: [], has: () => false, assets: ['wrong-reflection.png', '../x.png'] });
    expect(extra.filter(e => e.key === 'hidden-garden:wrong-reflection.png')).toEqual([
      { key: 'hidden-garden:wrong-reflection.png', url: '/assets/stages/hidden-garden/wrong-reflection.png', kind: 'image', optional: true }]);
    expect(extra.some(e => e.url.includes('..'))).toBe(false);
  });
});

describe('fetchJson', () => {
  it('treats a dev server HTML fallback as missing', async () => {
    const request = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), text: async () => '<!doctype html>' }));
    await expect(fetchJson(request as unknown as typeof fetch, '/x.json')).rejects.toThrow('HTTP 404');
  });
  it('times out instead of waiting forever', async () => {
    const request = vi.fn((_: unknown, init?: RequestInit) => new Promise((_, reject) =>
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(fetchJson(request as unknown as typeof fetch, '/x.json', 10)).rejects.toThrow('timed out');
  });
});

describe('asset loader', () => {
  it('loads a region and hands Stage its data, with {} for absent optional files', async () => {
    const h = harness({ missing: ['surfaces.json'] });
    const manifest = await h.loader.region('hidden-garden', 'clean', true);
    expect(manifest?.region).toBe('hidden-garden');
    const data = h.loader.stageData(manifest!, 'clean');
    expect(data.collisions).toHaveLength(2);
    expect(data.atmosphere).toEqual({ wind: 1 });
    expect(data.surfaces).toEqual({});
    const s = h.tracker.summary();
    expect(s.errors).toEqual([]);
    expect(s.missing.map(f => f.key)).toContain('surfaces:hidden-garden');
    for (const board of BOARDS) expect(h.textures.has(board)).toBe(true);
    expect(h.json.has('map-stage-hidden-garden') && h.json.has('map-stage-rusty-creek')).toBe(true);
    expect(s.fraction).toBe(1);
  });
  it('a region swap loads only what the new region adds', async () => {
    const h = harness();
    await h.loader.region('hidden-garden', 'clean', true);
    h.load.atlas.mockClear(); h.load.image.mockClear();
    await h.loader.region('rusty-creek', 'clean', false);
    expect(h.load.atlas).not.toHaveBeenCalled();
    expect(h.load.image.mock.calls.map(c => c[0])).toEqual(['rusty-creek:sky.png', 'rusty-creek:0-play.png', 'rusty-creek:1-play.png']);
  });
  it('reports a missing required file instead of throwing, and a retry fetches only that file', async () => {
    const h = harness({ brokenImages: ['hero-run'] });
    await h.loader.region('hidden-garden', 'clean', false);
    expect(h.tracker.summary().errors.map(e => e.key)).toEqual(['hero-run']);
    const calls = (h.request as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    h.load.atlas.mockClear();
    await h.loader.region('hidden-garden', 'clean', false);
    expect((h.request as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls); // JSON all cached
    expect(h.load.atlas.mock.calls.map(c => c[0])).toEqual(['hero-run']);
  });
  it('degrades to placeholders and a one-plate stage when continuing past failures', async () => {
    const h = harness({ missing: ['stage.json'], brokenImages: ['hero-run'] });
    expect(await h.loader.region('hidden-garden', 'clean', false)).toBeUndefined();
    expect(h.tracker.summary().errors.map(e => e.key)).toContain('stage:hidden-garden');
    const stageData = await h.loader.degrade('hidden-garden', 'clean', undefined);
    expect(stageData.chunks[0].id).toBe('fallback');
    expect(h.textures.has('hidden-garden:missing.png')).toBe(true);
    expect(h.load.atlas).toHaveBeenCalledWith('hero-run', '/assets/placeholder/hero.png', atlas);
    expect(h.loader.stageData(stageData, 'clean').collisions).toEqual([]);
  });
  it('rejects an atlas whose clips name missing frames', async () => {
    const h = harness();
    h.json.set('atlas:hero-move', { frames: {} }); h.json.set('hero-move.anims', clips);
    await h.loader.region('hidden-garden', 'clean', false);
    expect(h.tracker.summary().errors.map(e => e.key)).toEqual(expect.arrayContaining(['atlas:hero-move', 'hero-move']));
  });
});

describe('preload', () => {
  it('takes the region from swapRegion, then the URL, then the slice start', () => {
    expect(resolveTarget({ region: 'rusty-creek', state: 'clean' }, '?region=x')).toEqual({ region: 'rusty-creek', state: 'clean', first: false });
    expect(resolveTarget({}, '?region=rusty-creek')).toEqual({ region: 'rusty-creek', state: 'anomaly', first: true });
    expect(resolveTarget({}, '')).toEqual({ region: 'hidden-garden', state: 'clean', first: true });
  });
  it('writes boot-log lines by file name', () => {
    const entry = { key: 'a', url: '/assets/sprites/hero-move.png', kind: 'image' as const };
    expect(logLine({ entry, status: 'done', loaded: 1, total: 1 })).toBe('LOAD hero-move.png OK');
    expect(logLine({ entry, status: 'failed', loaded: 0, total: 0, reason: 'HTTP 404' })).toBe('FAIL hero-move.png (HTTP 404)');
    expect(logLine({ entry: { ...entry, optional: true }, status: 'failed', loaded: 0, total: 0 })).toBe('SKIP hero-move.png (NONE)');
  });
});
