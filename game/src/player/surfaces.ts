import type { StageManifest, RegionState } from '../stage/manifest';
import { stageBase } from '../stage/assets';

/** What a footfall or landing kicks up: procedural pixels in the region's palette until sprites exist. */
/** `sprite`: an fx-ground clip (dust, grass, leaf-kick, splash) played once at the foot; `shape`/`colors`/`count`: the procedural pixels. */
export interface Puff { sprite?: string; shape: 'dust' | 'blade' | 'leaf'; colors: string[]; count: number }
/** `sink`: px the feet sink in (visual only). `cover`: lowest sprite rows the ground hides. `blades`: tuft colours drawn over the feet. */
export interface Material { sink: number; cover?: number; blades?: string[]; puff?: Puff }
export interface SurfaceRange { x: [number, number]; y?: [number, number]; states?: string[]; material: string; note?: string }
export interface SurfaceData {
  region: string; default: string; note?: string;
  materials: Record<string, Material>;
  chunks: Record<string, SurfaceRange[]>;
}
export interface Surface { name: string; material: Material }

/** Without a surfaces file the hero still stands slightly in the ground (stone-like). */
export const FALLBACK: Surface = { name: 'ground', material: { sink: 1, cover: 0,
  puff: { shape: 'dust', colors: ['#c9bfa8', '#e6dcc4', '#9b927f'], count: 3 } } };
const SHAPES = ['dust', 'blade', 'leaf'];
const COLOR = /^#[0-9a-f]{6}$/i;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid surfaces: ${message}`);
}
const pair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n)) && v[0] < v[1];

export function parseSurfaces(value: unknown): SurfaceData {
  assert(typeof value === 'object' && value !== null, 'object');
  const data = value as SurfaceData;
  assert(typeof data.materials === 'object' && data.materials !== null, 'materials');
  for (const [name, m] of Object.entries(data.materials)) {
    assert(typeof m.sink === 'number' && m.sink >= 0 && m.sink <= 8, `${name}.sink 0–8`);
    assert(m.cover === undefined || typeof m.cover === 'number' && m.cover >= 0 && m.cover <= m.sink, `${name}.cover ≤ sink`);
    assert(m.blades === undefined || Array.isArray(m.blades) && m.blades.every(c => COLOR.test(c)), `${name}.blades`);
    if (m.puff) {
      assert(SHAPES.includes(m.puff.shape), `${name}.puff.shape`);
      assert(m.puff.sprite === undefined || /^[a-z][a-z-]*$/.test(m.puff.sprite), `${name}.puff.sprite`);
      assert(Array.isArray(m.puff.colors) && m.puff.colors.length > 0 && m.puff.colors.every(c => COLOR.test(c)), `${name}.puff.colors`);
      assert(Number.isInteger(m.puff.count) && m.puff.count >= 0, `${name}.puff.count`);
    }
  }
  assert(data.materials[data.default], 'default must name a material');
  assert(typeof data.chunks === 'object' && data.chunks !== null, 'chunks');
  for (const [chunk, ranges] of Object.entries(data.chunks)) {
    assert(Array.isArray(ranges), `${chunk} ranges`);
    for (const r of ranges) {
      assert(pair(r.x), `${chunk} x range`);
      assert(r.y === undefined || pair(r.y), `${chunk} y range`);
      assert(data.materials[r.material], `${chunk} unknown material ${r.material}`);
    }
  }
  return data;
}

/** World-space lookup: chunk by grid position, then the first authored range that holds the feet. */
export class SurfaceMap {
  private chunks: { x: number; y: number; ranges: SurfaceRange[] }[];
  constructor(private data: SurfaceData | null, manifest: Pick<StageManifest, 'chunkSize' | 'chunks'>, private state: RegionState | string) {
    const [w, h] = manifest.chunkSize;
    this.chunks = manifest.chunks.map(c => ({ x: c.x * w, y: c.y * h, ranges: data?.chunks[c.id] ?? [] }));
    this.size = [w, h];
  }
  private size: [number, number];
  at(x: number, y: number): Surface {
    if (!this.data) return FALLBACK;
    const chunk = this.chunks.find(c => x >= c.x && x < c.x + this.size[0] && y >= c.y && y < c.y + this.size[1]);
    const lx = x - (chunk?.x ?? 0), ly = y - (chunk?.y ?? 0);
    const range = chunk?.ranges.find(r => lx >= r.x[0] && lx < r.x[1] && (!r.y || ly >= r.y[0] && ly < r.y[1])
      && (!r.states || r.states.includes(this.state)));
    const name = range?.material ?? this.data.default;
    return { name, material: this.data.materials[name] };
  }
}

/** Fallback loader for when the Preload scene did not pass `surfaces` (a region without the file yields null). */
export async function loadSurfaces(region: string, request: typeof fetch = (...args) => fetch(...args)) {
  try {
    const response = await request(`${stageBase(region)}surfaces.json`);
    if (!response.ok) return null;
    return parseSurfaces(await response.json());
  } catch (error) {
    console.warn(error);
    return null;
  }
}
