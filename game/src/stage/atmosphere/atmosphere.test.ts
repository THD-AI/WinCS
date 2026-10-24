import { describe, expect, it } from 'vitest';
import garden from '../../../../art/stages/hidden-garden/atmosphere.json';
import { DEFAULT_ATMOSPHERE, layerAtmosphere, parseAtmosphere } from './config';
import { gustAt, maxSway, swayAt, swayWeight } from './wind';
import { anchorProfile, autumnPalette, mirrorY, onScreen, PROFILE_SIZE, waterline, waterlineAt, waterPoints, type Pixels, type WaterSpan } from './analysis';
import { seeded } from './sprites';
import { FOREGROUND_DEPTH, HERO_DEPTH, layerDepth, layerRanks, LEAVES_BEHIND_DEPTH, LEAVES_FRONT_DEPTH } from '../depth';

function pixels(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number] | null, scale = 1): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = paint(x, y);
    if (c) data.set(c, (y * width + x) * 4);
  }
  return { width, height, data, scale };
}

describe('atmosphere.json', () => {
  it('gives the defaults for {} or a missing file', () => {
    expect(parseAtmosphere({})).toEqual({ atmosphere: DEFAULT_ATMOSPHERE, problems: [] });
    expect(parseAtmosphere(undefined).atmosphere).toEqual(DEFAULT_ATMOSPHERE);
  });

  it('reads the committed Hidden Garden file without a problem', () => {
    const raw: unknown = garden;
    const { atmosphere, problems } = parseAtmosphere(raw, 'clean');
    expect(problems).toEqual([]);
    expect(atmosphere.layers['07-foreground'].blur).toBeGreaterThan(0);
    expect(parseAtmosphere(raw, 'anomaly').atmosphere.leaves.fall).toBe('up');
  });

  it('reports a bad field and keeps its default', () => {
    const { atmosphere, problems } = parseAtmosphere({ wind: { base: 7, direction: 0 }, layers: { x: { sway: 'a', wobble: 1 } }, leaves: { front: { tint: 'red' } } });
    expect(atmosphere.wind.base).toBe(DEFAULT_ATMOSPHERE.wind.base);
    expect(atmosphere.wind.direction).toBe(-1);
    expect(atmosphere.leaves.front?.tint).toBe(0xffffff);
    expect(problems.join('\n')).toMatch(/wind\.base/);
    expect(problems.join('\n')).toMatch(/layers\.x\.wobble is unknown/);
    expect(problems.join('\n')).toMatch(/leaves\.front\.tint/);
  });

  it('turns sections off with null', () => {
    const { atmosphere } = parseAtmosphere({ leaves: { behind: null }, water: null });
    expect(atmosphere.leaves.behind).toBeNull();
    expect(atmosphere.leaves.front).not.toBeNull();
    expect(atmosphere.water).toBeNull();
  });

  it('derives a layer without an entry from its nearness; an entry wins', () => {
    const atmo = parseAtmosphere({ layers: { '03-rear': { sway: 9 } } }).atmosphere;
    const far = layerAtmosphere(atmo, { id: '01-far', z: 1, scroll: 0.25 });
    const front = layerAtmosphere(atmo, { id: '07-foreground', z: 7, scroll: 1.2 });
    expect(far.sway).toBeLessThan(front.sway);
    expect(far.blur).toBe(0);
    expect(layerAtmosphere(atmo, { id: '03-rear', z: 3, scroll: 1 }).sway).toBe(9);
    const water = layerAtmosphere(atmo, { id: '04-water', z: 4, scroll: 1 });
    expect(water.sway).toBe(0);
  });
});

describe('depth bands', () => {
  it('keeps layers z 0–5 under the actors and z 6–7 over them', () => {
    expect(layerDepth(5, 89)).toBeLessThan(HERO_DEPTH - 1);
    expect(layerDepth(6, 0)).toBeGreaterThanOrEqual(FOREGROUND_DEPTH);
    expect(LEAVES_BEHIND_DEPTH).toBeLessThan(HERO_DEPTH);
    expect(LEAVES_FRONT_DEPTH).toBeGreaterThan(HERO_DEPTH);
    expect(LEAVES_FRONT_DEPTH).toBeLessThan(FOREGROUND_DEPTH);
    expect(() => layerDepth(3, 90)).toThrow();
  });

  it('ranks a layer the same in every chunk, even where a chunk lists fewer', () => {
    const full = [{ id: 'sky', z: 0 }, { id: 'far', z: 1 }, { id: 'rear', z: 3 }, { id: 'play', z: 5 }, { id: 'fg', z: 7 }];
    const short = [{ id: 'rear', z: 3 }, { id: 'play', z: 5 }, { id: 'fg', z: 7 }];
    const ranks = layerRanks([full, short]);
    expect(ranks.get('rear')).toBeGreaterThan(ranks.get('far')!);
    expect(layerDepth(3, ranks.get('rear')!)).toBeGreaterThan(layerDepth(1, ranks.get('far')!));
  });

  it('keeps the authored list order inside a band over z (Rusty Creek water after the path)', () => {
    const list = [{ id: 'bank', z: 2 }, { id: 'supports', z: 3 }, { id: 'path', z: 5 }, { id: 'rails', z: 6 }, { id: 'foliage', z: 7 }, { id: 'water', z: 4 }];
    const ranks = layerRanks([list]);
    expect(ranks.get('water')).toBeGreaterThan(ranks.get('path')!);
    expect(ranks.get('foliage')).toBeGreaterThan(ranks.get('rails')!);
    expect(layerDepth(4, ranks.get('water')!)).toBeLessThan(HERO_DEPTH);
  });
});

describe('the wind', () => {
  const wind = DEFAULT_ATMOSPHERE.wind;
  const layer = { sway: 3, reach: 100 };

  it('leaves the anchor still and moves the top most', () => {
    expect(swayWeight(0, 100)).toBe(0);
    expect(swayWeight(50, 100)).toBeCloseTo(0.5);
    expect(swayWeight(400, 100)).toBe(1);
    for (let t = 0; t < 20; t += 0.37) expect(Math.abs(swayAt(wind, layer, 500, 0, t))).toBe(0);
  });

  it('never moves a layer more than its amplitude allows', () => {
    for (let t = 0; t < 30; t += 0.13) for (let x = 0; x < 3000; x += 211) {
      expect(Math.abs(swayAt(wind, layer, x, 300, t))).toBeLessThanOrEqual(maxSway(wind, layer) + 1e-9);
    }
  });

  it('sends gusts downwind', () => {
    // Find a gust peak at t = 0 and check that it has moved left (direction -1) one second later.
    let peak = 0;
    for (let x = 0; x < wind.gustLength; x++) if (gustAt(wind, x, 0) > gustAt(wind, peak, 0)) peak = x;
    let later = 0, best = -1;
    for (let x = peak - wind.gustLength / 2; x < peak + wind.gustLength / 2; x++) {
      const g = gustAt(wind, x, 1);
      if (g > best) { best = g; later = x; }
    }
    expect(later - peak).toBeCloseTo(-wind.gustSpeed, -1);
  });
});

describe('reading the art', () => {
  it('anchors a plant at its lowest pixel and grass at its surface', () => {
    // A column of 'trunk' from row 2 to row 7 in a 10-row layer, across the whole width.
    const p = pixels(96, 10, (_x, y) => (y >= 2 && y <= 7 ? [200, 100, 20, 255] : null));
    expect(anchorProfile(p, 'base')[10]).toBeCloseTo(7.5);
    expect(anchorProfile(p, 'top')[10]).toBeCloseTo(2.5);
    expect(anchorProfile(p, 'base').length).toBe(PROFILE_SIZE);
  });

  it('fills empty columns from their neighbours', () => {
    const p = pixels(96, 10, x => (x < 10 ? [0, 0, 0, 255] : null));
    const profile = anchorProfile(p, 'base');
    expect(profile[PROFILE_SIZE - 1]).toBeCloseTo(9.5);
  });

  it('finds the waterline below stray specks, in full-size px', () => {
    const p = pixels(40, 30, (x, y) => (y >= 20 || (y === 4 && x < 3) ? [40, 90, 200, 255] : null), 2);
    expect(waterline(p)).toBe(40);
    expect(waterline(pixels(4, 4, () => null))).toBe(-1);
  });

  it('collects water points and the bright ones for sparkles', () => {
    const p = pixels(16, 16, (x, y) => (y >= 8 ? (x < 8 ? [250, 250, 250, 255] : [20, 40, 90, 255]) : null));
    const { all, bright } = waterPoints(p, 8, 4);
    expect(all.length).toBe(2 * 2 * 4);
    expect(bright.length).toBe(2 * 2 * 2);
    expect(Math.min(...all.filter((_, i) => i % 2 === 1))).toBe(8);
  });

  it('samples autumn colours and skips greens, greys and blues', () => {
    const p = pixels(10, 10, (x) => (x < 5 ? [220, 120, 30, 255] : x < 7 ? [40, 160, 40, 255] : x < 9 ? [128, 128, 128, 255] : [40, 80, 220, 255]));
    const palette = autumnPalette(p);
    expect(palette).toEqual([(220 << 16) | (120 << 8) | 30]);
  });

  it('culls a layer only when it is off screen at its own parallax', () => {
    expect(onScreen(2160, 2160, 0.1, 9000, 1280)).toBe(true); // 2160 − 900 = 1260 < 1280
    expect(onScreen(4320, 2160, 1, 0, 1280)).toBe(false);
    expect(onScreen(0, 2160, 1, 2200, 1280)).toBe(false);
  });
});

describe('reflections', () => {
  const spans = [{ x0: 0, x1: 2160, y: 480 }, { x0: 2160, x1: 4320, y: 470 }] as unknown as WaterSpan[];
  it('mirrors an actor about the waterline under it', () => {
    expect(waterlineAt(spans, 100)).toBe(480);
    expect(waterlineAt(spans, 3000)).toBe(470);
    expect(waterlineAt(spans, 5000)).toBeNull();
    expect(mirrorY(480, 470)).toBe(490);
  });

  it('places pads the same way every run', () => {
    const a = seeded(404), b = seeded(404);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
