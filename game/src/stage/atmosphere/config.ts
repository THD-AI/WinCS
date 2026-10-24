/**
 * atmosphere.json – the per-region description of everything that moves on a stage (docs/09, docs/15):
 * wind, how each layer sways, depth of field, falling leaves and the water. Parsing is lenient: a bad
 * field is reported and replaced by its default, so a typo never blanks the stage.
 */
import { isForeground } from '../depth';

export interface Wind {
  /** Steady sway, as a share of a layer's amplitude (0–1). */
  base: number;
  /** Extra lean while a gust passes (0–2). */
  gust: number;
  /** Gust fronts travel this fast across the layer, px/s. */
  gustSpeed: number;
  /** Distance between gust fronts, px. */
  gustLength: number;
  /** Sway cycles per second. */
  frequency: number;
  /** -1: the wind blows to the left, 1: to the right. */
  direction: 1 | -1;
}

export interface LayerFx {
  /** Horizontal sway at full weight, px. Far layers drift a pixel; the foreground moves a few. */
  sway: number;
  /** Height over which the sway weight goes from 0 at the anchor to 1, px. */
  reach: number;
  /** 'base': rooted at the lowest opaque row of each column (trees, foreground plants); 'top': the grass on a surface. */
  anchor: 'base' | 'top';
  /** Saturation below which a pixel never moves (stone, wood, walls); 0 lets everything move. */
  foliage: number;
  /** Vertical bob at full weight, px (lily pads and flower heads in the foreground). */
  bob: number;
  /** Depth-of-field blur radius, px (foreground layers). */
  blur: number;
  /** Horizontal water ripple below the waterline, px. */
  ripple: number;
  /** Highlights glinting on the water, 0–1. */
  shimmer: number;
}

export interface LeafLayer {
  /** ms between leaves. */
  every: number;
  /** Pixel scale range. */
  scale: [number, number];
  /** Parallax of the leaves against the camera (foreground > 1, behind < 1). */
  scroll: number;
  alpha: number;
  /** Multiplied colour, e.g. '#c8c0b8' to sink the back leaves into the haze. */
  tint: number;
}

export interface Leaves {
  /** Leaf colours; empty: sampled from the stage art (autumn hues of the rear and foreground layers). */
  palette: number[];
  /** 'down': they fall; 'up': they rise (the anomaly). */
  fall: 'down' | 'up';
  front: LeafLayer | null;
  behind: LeafLayer | null;
}

export interface Water {
  /** The layer id that holds the water; its waterline is found from its alpha. */
  layer: string;
  /** The hero's mirror image in the water, or null for none. */
  reflect: { alpha: number; tint: number } | null;
  /** Bobbing lily pads (fx-water lily-bob) per 1000 px of water, on the near half of the band. */
  pads: number;
  /** Pad tint and scale, to match the pads painted in the art. */
  padTint: number;
  padScale: number;
  /** Mean ms between ripple rings / sparkles on screen (0: none). */
  ripples: number;
  sparkles: number;
}

export interface Atmosphere {
  wind: Wind;
  /** Applied to a layer without its own entry, scaled by nearness (sway × scroll²). */
  defaults: LayerFx;
  layers: Record<string, Partial<LayerFx>>;
  leaves: Leaves;
  water: Water | null;
}

export const DEFAULT_ATMOSPHERE: Atmosphere = {
  wind: { base: 0.45, gust: 0.9, gustSpeed: 240, gustLength: 1400, frequency: 0.55, direction: -1 },
  defaults: { sway: 1.5, reach: 260, anchor: 'base', foliage: 0.3, bob: 0, blur: 0, ripple: 0, shimmer: 0 },
  layers: {},
  leaves: {
    palette: [], fall: 'down',
    front: { every: 420, scale: [1, 2], scroll: 1.15, alpha: 1, tint: 0xffffff },
    behind: { every: 300, scale: [1, 1.25], scroll: 0.85, alpha: 0.9, tint: 0xd8d0c8 },
  },
  water: { layer: '04-water', reflect: { alpha: 0.5, tint: 0x7890b0 }, pads: 3, padTint: 0xc8a070, padScale: 1.15, ripples: 900, sparkles: 220 },
};

type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);

class Reader {
  problems: string[] = [];
  number(source: Obj, key: string, fallback: number, min: number, max: number, path: string): number {
    const value = source[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      this.problems.push(`${path}.${key} must be a number in ${min}–${max}`);
      return fallback;
    }
    return value;
  }
  colour(source: Obj, key: string, fallback: number, path: string): number {
    const value = source[key];
    if (value === undefined) return fallback;
    const parsed = parseColour(value);
    if (parsed === null) { this.problems.push(`${path}.${key} must be a #rrggbb colour`); return fallback; }
    return parsed;
  }
  section(source: Obj, key: string, path: string): Obj | null | undefined {
    const value = source[key];
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!object(value)) { this.problems.push(`${path}.${key} must be an object`); return undefined; }
    return value;
  }
}

export function parseColour(value: unknown): number | null {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? parseInt(value.slice(1), 16) : null;
}

function layerFx(read: Reader, source: Obj, path: string, fallback?: LayerFx): Partial<LayerFx> {
  const out: Partial<LayerFx> = {};
  const numbers: [keyof LayerFx, number, number][] = [
    ['sway', 0, 16], ['reach', 1, 2000], ['foliage', 0, 1], ['bob', 0, 8], ['blur', 0, 4], ['ripple', 0, 8], ['shimmer', 0, 1]];
  for (const [key, min, max] of numbers) {
    if (source[key] !== undefined || fallback) {
      (out as Record<string, number>)[key] = read.number(source, key, fallback ? fallback[key] as number : 0, min, max, path);
    }
  }
  if (source.anchor !== undefined) {
    if (source.anchor === 'base' || source.anchor === 'top') out.anchor = source.anchor;
    else read.problems.push(`${path}.anchor must be "base" or "top"`);
  }
  if (fallback && !out.anchor) out.anchor = fallback.anchor;
  for (const key of Object.keys(source)) {
    if (!['sway', 'reach', 'anchor', 'foliage', 'bob', 'blur', 'ripple', 'shimmer', 'note'].includes(key)) read.problems.push(`${path}.${key} is unknown`);
  }
  return out;
}

function leafLayer(read: Reader, source: Obj | null | undefined, fallback: LeafLayer | null, path: string): LeafLayer | null {
  if (source === null) return null;
  if (source === undefined) return fallback;
  fallback ??= DEFAULT_ATMOSPHERE.leaves.front!;
  let scale = fallback.scale;
  if (source.scale !== undefined) {
    const s = source.scale;
    if (Array.isArray(s) && s.length === 2 && s.every(v => typeof v === 'number' && v > 0 && v <= 8) && s[0] <= s[1]) scale = [s[0], s[1]];
    else read.problems.push(`${path}.scale must be [min, max] in 0–8`);
  }
  return {
    every: read.number(source, 'every', fallback.every, 30, 10_000, path),
    scale,
    scroll: read.number(source, 'scroll', fallback.scroll, 0, 3, path),
    alpha: read.number(source, 'alpha', fallback.alpha, 0, 1, path),
    tint: read.colour(source, 'tint', fallback.tint, path),
  };
}

/**
 * Read an atmosphere.json value (anything – `{}` or a missing file give the defaults).
 * `state` picks the optional `states.<state>` overrides, merged section by section.
 */
export function parseAtmosphere(value: unknown, state?: string): { atmosphere: Atmosphere; problems: string[] } {
  const read = new Reader();
  const d = DEFAULT_ATMOSPHERE;
  let root: Obj = object(value) ? value : {};
  if (value !== undefined && value !== null && !object(value)) read.problems.push('atmosphere must be an object');
  const states = object(root.states) ? root.states : {};
  if (state && object(states[state])) {
    const over = states[state] as Obj;
    root = { ...root };
    for (const [key, section] of Object.entries(over)) {
      root[key] = object(root[key]) && object(section) ? { ...(root[key] as Obj), ...section } : section;
    }
  }

  const w = read.section(root, 'wind', 'wind') ?? {};
  const direction = w.direction === undefined ? d.wind.direction : w.direction === 1 || w.direction === -1 ? w.direction : null;
  if (direction === null) read.problems.push('wind.direction must be 1 or -1');
  const wind: Wind = {
    base: read.number(w, 'base', d.wind.base, 0, 1, 'wind'),
    gust: read.number(w, 'gust', d.wind.gust, 0, 2, 'wind'),
    gustSpeed: read.number(w, 'gustSpeed', d.wind.gustSpeed, 0, 2000, 'wind'),
    gustLength: read.number(w, 'gustLength', d.wind.gustLength, 50, 20_000, 'wind'),
    frequency: read.number(w, 'frequency', d.wind.frequency, 0, 5, 'wind'),
    direction: direction ?? d.wind.direction,
  };

  const defaults = layerFx(read, read.section(root, 'defaults', 'defaults') ?? {}, 'defaults', d.defaults) as LayerFx;
  const layers: Record<string, Partial<LayerFx>> = {};
  const layerSection = read.section(root, 'layers', 'layers') ?? {};
  for (const [id, entry] of Object.entries(layerSection)) {
    if (!object(entry)) { read.problems.push(`layers.${id} must be an object`); continue; }
    layers[id] = layerFx(read, entry, `layers.${id}`);
  }

  const l = read.section(root, 'leaves', 'leaves');
  let leaves: Leaves;
  if (l === null) leaves = { ...d.leaves, front: null, behind: null };
  else {
    const source = l ?? {};
    const palette: number[] = [];
    if (source.palette !== undefined) {
      if (Array.isArray(source.palette) && source.palette.every(c => parseColour(c) !== null)) palette.push(...source.palette.map(c => parseColour(c) as number));
      else read.problems.push('leaves.palette must be a list of #rrggbb colours');
    }
    const fall = source.fall === undefined ? d.leaves.fall : source.fall === 'down' || source.fall === 'up' ? source.fall : null;
    if (fall === null) read.problems.push('leaves.fall must be "down" or "up"');
    leaves = {
      palette, fall: fall ?? d.leaves.fall,
      front: leafLayer(read, read.section(source, 'front', 'leaves'), d.leaves.front, 'leaves.front'),
      behind: leafLayer(read, read.section(source, 'behind', 'leaves'), d.leaves.behind, 'leaves.behind'),
    };
  }

  const wa = read.section(root, 'water', 'water');
  let water: Water | null = d.water;
  if (wa === null) water = null;
  else if (wa) {
    const layer = wa.layer === undefined ? d.water!.layer : typeof wa.layer === 'string' && wa.layer ? wa.layer : null;
    if (layer === null) read.problems.push('water.layer must be a layer id');
    const r = read.section(wa, 'reflect', 'water');
    water = {
      layer: layer ?? d.water!.layer,
      reflect: r === null ? null : {
        alpha: read.number(r ?? {}, 'alpha', d.water!.reflect!.alpha, 0, 1, 'water.reflect'),
        tint: read.colour(r ?? {}, 'tint', d.water!.reflect!.tint, 'water.reflect'),
      },
      pads: read.number(wa, 'pads', d.water!.pads, 0, 40, 'water'),
      padTint: read.colour(wa, 'padTint', d.water!.padTint, 'water'),
      padScale: read.number(wa, 'padScale', d.water!.padScale, 0.25, 4, 'water'),
      ripples: read.number(wa, 'ripples', d.water!.ripples, 0, 60_000, 'water'),
      sparkles: read.number(wa, 'sparkles', d.water!.sparkles, 0, 60_000, 'water'),
    };
  }
  return { atmosphere: { wind, defaults, layers, leaves, water }, problems: read.problems };
}

/**
 * What a layer does: its own entry over a default derived from its depth. Nearer layers (higher
 * scroll) sway more (× scroll²); foreground layers get the default bob and blur; the water layer ripples.
 */
export function layerAtmosphere(atmosphere: Atmosphere, layer: { id: string; z: number; scroll: number }): LayerFx {
  const d = atmosphere.defaults;
  const water = atmosphere.water?.layer === layer.id;
  const derived: LayerFx = {
    sway: water ? 0 : d.sway * layer.scroll * layer.scroll,
    reach: d.reach,
    anchor: d.anchor,
    foliage: d.foliage,
    bob: isForeground(layer.z) ? d.bob : 0,
    blur: isForeground(layer.z) ? d.blur : 0,
    ripple: water ? d.ripple : 0,
    shimmer: water ? d.shimmer : 0,
  };
  return { ...derived, ...atmosphere.layers[layer.id] };
}
