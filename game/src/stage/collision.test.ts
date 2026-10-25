import { expect, it, vi } from 'vitest';
import { edgeWalls, loadCollisions, parseCollision, placeCollision, BOXES, EDGE_WALL, LINES, type CollisionData } from './collision';
import type { StageManifest } from './manifest';

const fixtures = import.meta.glob<CollisionData>('../../../art/stages/{rusty-creek,hidden-garden}/*.collision.json',
  { eager: true, import: 'default' });
function fixture(chunk = 'rc-0-0', state: 'clean' | 'anomaly' = 'anomaly'): CollisionData {
  const region = chunk.startsWith('hg-') ? 'hidden-garden' : 'rusty-creek';
  const data = fixtures[`../../../art/stages/${region}/${chunk}.${state}.collision.json`];
  if (!data) throw new Error(`Missing committed fixture ${chunk}.${state}`);
  return structuredClone(data);
}

it('reads every committed jam collision file without discarding encounter metadata', () => {
  for (const state of ['clean', 'anomaly'] as const) for (let x = 0; x < 3; x++) {
    const id = `rc-${x}-0`, raw = fixture(id, state);
    expect(parseCollision(raw, id, state)).toEqual(raw);
  }
  const garden = fixture('hg-0-0', 'clean');
  expect(parseCollision(garden, 'hg-0-0', 'clean')).toEqual(garden);
  const creek = parseCollision(fixture(), 'rc-0-0', 'anomaly');
  expect(creek.interact.find(item => item.id === 'chair')?.item).toBe('chair');
});

it('places polylines, boxes, spawns and patrol bounds on a four-direction grid', () => {
  const local = parseCollision(fixture(), 'rc-0-0', 'anomaly'), before = structuredClone(local);
  const { world } = placeCollision(local, [2160, -720]);
  expect(world.walk[0][0]).toEqual([2160, -259]);
  expect(world.spawn.find(p => p.id === 'rover-1')).toMatchObject({ x: 2920, y: -212, patrol: [2800, 3040] });
  expect(world.interact.find(p => p.id === 'chair')).toMatchObject({ x: 2476, y: -295, item: 'chair' });
  expect(local).toEqual(before);
});

it('rejects missing categories, wrong identities and non-integer/outside points', () => {
  for (const change of [(d: CollisionData) => { delete (d as Partial<CollisionData>).walk; }, (d: CollisionData) => { d.chunk = 'rc-2-0'; },
    (d: CollisionData) => { d.state = 'clean'; }, (d: CollisionData) => { d.spawn[0].x = 0.5; },
    (d: CollisionData) => { d.walk[0][0][1] = 721; }]) {
    const raw = fixture(); change(raw);
    expect(() => parseCollision(raw, 'rc-0-0', 'anomaly')).toThrow('Invalid collision');
  }
});

it('rejects malformed lines, boxes, hazard damage and duplicate ids', () => {
  for (const change of [(d: CollisionData) => { d.walk[0].reverse(); }, (d: CollisionData) => { d.solid[0].w = 0; },
    (d: CollisionData) => { d.climb[0].kind = ''; }, (d: CollisionData) => { d.spawn[0].id = d.climb[0].id; },
    (d: CollisionData) => { d.hazard.push({ x: 1, y: 1, w: 10, h: 10, damage: 0 }); }]) {
    const raw = fixture(); change(raw);
    expect(() => parseCollision(raw, 'rc-0-0', 'anomaly')).toThrow('Invalid collision');
  }
});

it('retains reserved ledge and glide data without converting either to ground or walls', () => {
  const raw = fixture(); raw.ledge.push({ x: 200, y: 100 });
  raw.glideLift.push({ x: 300, y: 200, w: 50, h: 100 });
  const { world } = placeCollision(parseCollision(raw, 'rc-0-0', 'anomaly'), [2160, 0]);
  expect(world.ledge).toEqual([{ x: 2360, y: 100 }]);
  expect(world.glideLift[0].x).toBe(2460);
  for (const key of LINES) expect(world[key]).toHaveLength(raw[key].length);
  expect(world.solid).toHaveLength(raw.solid.length);
});

function manifest(): StageManifest {
  return { region: 'rusty-creek', chunkSize: [2160, 720], chunks: [0, 1].map(x => ({
    id: `rc-${x}-0`, x, y: 0, states: { anomaly: { layers: [], collision: `rc-${x}-0.anomaly.collision.json` } },
  })) };
}

it('fetches the collision files beside the manifest and builds world coordinates', async () => {
  const request = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
    fixture(String(url).includes('rc-1-0') ? 'rc-1-0' : 'rc-0-0'))));
  const chunks = await loadCollisions(manifest(), 'anomaly', request);
  expect(request).toHaveBeenCalledWith('/assets/stages/rusty-creek/rc-0-0.anomaly.collision.json');
  expect(chunks[1].origin).toEqual([2160, 0]);
  // every authored box is placed; the loader only adds the walls that close the row's open ends (edgeWalls)
  for (const key of BOXES) expect(chunks[1].world[key].filter(b => b.kind !== 'edge')).toHaveLength(chunks[1].local[key].length);
  expect(chunks[1].world.solid.filter(b => b.kind === 'edge').map(b => b.x)).toEqual([4320]);
});

it('refuses a missing collision file instead of inferring physics from artwork', async () => {
  const request = vi.fn(async () => new Response('', { status: 404 }));
  await expect(loadCollisions(manifest(), 'anomaly', request)).rejects.toThrow('HTTP 404');
  const input = manifest(); input.chunks[0].states.anomaly!.collision = null;
  await expect(loadCollisions(input, 'anomaly', request)).rejects.toThrow('Missing collision:');
});

it("closes each row where it has no neighbour: the cellar under the shed is its row's left end", () => {
  const placement = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  const chunks = placement.map(p => placeCollision(fixture('hg-2-1', 'clean'), [p.x * 2160, p.y * 720]));
  edgeWalls(chunks, placement, [2160, 720]);
  const edges = chunks.map(c => c.world.solid.filter(s => s.kind === 'edge').map(s => s.x));
  expect(edges[0]).toEqual([-EDGE_WALL]);              // the row's left end, nothing to its right is open
  expect(edges[1]).toEqual([4320]);                    // the row's right end
  expect(edges[2]).toEqual([2160 - EDGE_WALL, 4320]);  // alone in its row: both ends
  expect(chunks[2].world.solid.every(s => s.kind !== 'edge' || s.h === 720 && s.y === 720)).toBe(true);
});
