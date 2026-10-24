import { assetFile, type StageManifest, type RegionState } from './manifest';
import { stageBase } from './assets';

export type Point = [number, number];
export interface Marker { x: number; y: number; id?: string; kind?: string; [key: string]: unknown }
export interface Box extends Marker { w: number; h: number }
export const LINES = ['walk', 'slide', 'oneWay'] as const;
export const BOXES = ['climb', 'solid', 'noGo', 'hazard', 'interact', 'glideLift'] as const;
export const POINTS = ['spawn', 'ledge'] as const;
export type Geometry = Record<typeof LINES[number], Point[][]>
  & Record<typeof BOXES[number], Box[]> & Record<typeof POINTS[number], Marker[]>;
export type CollisionData = Geometry & { chunk: string; state: RegionState; size: [number, number] };
export interface CollisionChunk { local: CollisionData; origin: Point; world: Geometry }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid collision: ${message}`);
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const kind = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]*$/.test(v);

/** Read authored shapes only. Reserved ledges and glide lifts never become solids. */
export function parseCollision(value: unknown, chunk: string, state: RegionState): CollisionData {
  assert(object(value) && value.chunk === chunk && value.state === state, `${chunk}.${state} identity`);
  assert(Array.isArray(value.size) && value.size.length === 2 && value.size[0] === 2160 && value.size[1] === 720, 'size');
  const inside = (x: unknown, y: unknown) => {
    assert(integer(x) && integer(y) && x >= 0 && x <= 2160 && y >= 0 && y <= 720, 'integer point outside chunk');
  };
  const ids = new Set<string>();
  for (const key of [...LINES, ...BOXES, ...POINTS]) {
    const entries = value[key];
    assert(Array.isArray(entries), `${key} must be an array`);
    if ((LINES as readonly string[]).includes(key)) {
      for (const line of entries) {
        assert(Array.isArray(line) && line.length >= 2, `${key} polyline`);
        for (const p of line) { assert(Array.isArray(p) && p.length === 2, `${key} point`); inside(p[0], p[1]); }
        assert(line.every((p, i) => i === 0 || p[0] > line[i - 1][0]), `${key} must run left to right`);
      }
      continue;
    }
    for (const item of entries) {
      assert(object(item), `${key} object`); inside(item.x, item.y);
      if ((BOXES as readonly string[]).includes(key)) {
        assert(integer(item.w) && integer(item.h) && item.w > 0 && item.h > 0, `${key} box dimensions`);
        inside(Number(item.x) + item.w, Number(item.y) + item.h);
      }
      if (key === 'climb' || key === 'interact' || key === 'spawn') assert(kind(item.kind), `${key} kind`);
      if (key === 'interact' || key === 'spawn') assert(typeof item.id === 'string' && item.id.length > 0, `${key} id`);
      if (item.id !== undefined) {
        assert(typeof item.id === 'string' && item.id.length > 0 && !ids.has(item.id), 'duplicate/invalid id');
        ids.add(item.id);
      }
      if (key === 'hazard') assert(integer(item.damage) && item.damage > 0, 'hazard damage');
    }
  }
  return value as unknown as CollisionData;
}

/** Grid offsets apply to geometry and local horizontal patrol bounds, not metadata. */
export function placeCollision(local: CollisionData, origin: Point): CollisionChunk {
  const [dx, dy] = origin;
  const marker = <T extends Marker>(item: T): T => ({ ...item, x: item.x + dx, y: item.y + dy });
  const world = Object.fromEntries([
    ...LINES.map(key => [key, local[key].map(line => line.map(([x, y]): Point => [x + dx, y + dy]))]),
    ...BOXES.map(key => [key, local[key].map(marker)]),
    ...POINTS.map(key => [key, local[key].map(item => {
      const placed = marker(item);
      if (key === 'spawn' && Array.isArray(item.patrol) && item.patrol.every(v => typeof v === 'number')) {
        placed.patrol = item.patrol.map(x => x + dx);
      }
      return placed;
    })]),
  ]) as Geometry;
  return { local, origin, world };
}

export async function loadCollisions(manifest: StageManifest, state: RegionState,
  request: typeof fetch = (...args) => fetch(...args)): Promise<CollisionChunk[]> {
  return Promise.all(manifest.chunks.map(async chunk => {
    const file = chunk.states[state]?.collision;
    if (!assetFile(file)) throw new Error(`Missing collision: ${manifest.region}/${chunk.id}.${state}`);
    const url = stageBase(manifest.region) + file;
    const response = await request(url);
    if (!response.ok) throw new Error(`Missing collision ${url}: HTTP ${response.status}`);
    return placeCollision(parseCollision(await response.json(), chunk.id, state),
      [chunk.x * manifest.chunkSize[0], chunk.y * manifest.chunkSize[1]]);
  }));
}
