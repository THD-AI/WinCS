export type RegionState = 'clean' | 'anomaly';
/** `dy`: the plate is drawn this many px lower than its chunk's top (a plate painted off its ground, export.json). */
export interface StageLayer { id: string; z: number; scroll: number; file: string; dy?: number }
export interface ChunkState { layers: StageLayer[]; collision: string | null }
export interface StageChunk { id: string; x: number; y: number; states: Partial<Record<RegionState, ChunkState>> }
export interface StageManifest { region: string; chunkSize: [number, number]; chunks: StageChunk[] }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid stage manifest: ${message}`);
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const assetFile = (value: unknown): value is string => typeof value === 'string'
  && /^[a-zA-Z0-9_.\/-]+$/.test(value) && !value.startsWith('/')
  && value.split('/').every(part => part !== '..' && part !== '.' && part !== '');

/** Validate the stage export without reordering its authored blend sequence. */
export function parseManifest(value: unknown): StageManifest {
  assert(object(value), 'expected an object');
  assert(typeof value.region === 'string' && /^[a-z][a-z0-9-]*$/.test(value.region), 'region');
  assert(Array.isArray(value.chunkSize) && value.chunkSize.length === 2
    && value.chunkSize[0] === 2160 && value.chunkSize[1] === 720, 'chunkSize must be 2160×720');
  assert(Array.isArray(value.chunks) && value.chunks.length > 0, 'chunks');
  const ids = new Set<string>(), grid = new Set<string>();
  for (const chunk of value.chunks) {
    assert(object(chunk) && typeof chunk.id === 'string' && chunk.id.length > 0, 'chunk id');
    assert(!ids.has(chunk.id), `duplicate chunk ${chunk.id}`); ids.add(chunk.id);
    assert(Number.isInteger(chunk.x) && Number.isInteger(chunk.y), 'integer grid coordinates');
    const cell = `${chunk.x},${chunk.y}`;
    assert(!grid.has(cell), `duplicate grid cell ${cell}`); grid.add(cell);
    assert(object(chunk.states) && Object.keys(chunk.states).length > 0, 'chunk states');
    for (const [name, state] of Object.entries(chunk.states)) {
      assert(name === 'clean' || name === 'anomaly', `unknown state ${name}`);
      assert(object(state) && Array.isArray(state.layers) && state.layers.length > 0, `${chunk.id}.${name} layers`);
      assert(state.collision === null || assetFile(state.collision), 'collision file');
      for (const layer of state.layers) {
        assert(object(layer) && typeof layer.id === 'string' && assetFile(layer.file), 'layer id/file');
        assert(Number.isInteger(layer.z) && Number(layer.z) >= 0 && Number(layer.z) <= 7, 'layer z');
        assert(typeof layer.scroll === 'number' && Number.isFinite(layer.scroll) && layer.scroll >= 0, 'scroll');
        assert(layer.dy === undefined || Number.isInteger(layer.dy), 'layer dy');
      }
    }
  }
  return value as unknown as StageManifest;
}

export function stageLayers(manifest: StageManifest, state: RegionState) {
  return manifest.chunks.flatMap(chunk => {
    const content = chunk.states[state];
    if (!content) throw new Error(`Missing ${manifest.region}/${chunk.id}.${state}`);
    return content.layers.map((layer, order) => ({ ...layer, order,
      x: chunk.x * manifest.chunkSize[0], y: chunk.y * manifest.chunkSize[1] + (layer.dy ?? 0) }));
  });
}
