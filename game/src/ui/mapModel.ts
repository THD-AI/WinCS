import type { GameEventBus, Position } from '../core/events';

/** The part of an exported `stage.json` the map needs (scripts/export_stage.py). */
export interface StageManifest {
  region: string;
  chunkSize: [number, number];
  chunks: { id: string; x: number; y: number }[];
}

export interface Room {
  region: string; id: string; gx: number; gy: number;
  visited: boolean; current: boolean;
  /** You saved at a coffee machine in this room (the map shows a cup). */
  saved: boolean;
}

/** Story order: the map lists regions top to bottom in the order you reach them (docs/04). */
export const REGION_ORDER = ['hidden-garden', 'rusty-creek'];

/**
 * What the pocket computer knows (#69): which rooms – stage chunks – you have been in and where you are.
 * Rooms fill in as you visit them (no minimap, docs/02); a region you haven't entered isn't shown at all.
 */
export class MapModel {
  unlocked = false;
  private regions = new Map<string, StageManifest>();
  private visited = new Set<string>();
  private saves = new Set<string>();
  private here?: string;

  addRegion(manifest: StageManifest): void {
    this.regions.set(manifest.region, manifest);
  }

  /** Dexter hands over the pocket computer (#52): the menu key opens the map from now on. */
  unlock(): void { this.unlocked = true; }

  visit(region: string, chunkId: string): void {
    const key = `${region}/${chunkId}`;
    this.visited.add(key);
    this.here = key;
  }

  /** Marks the room a stage position (px) is in; positions outside every chunk are ignored. */
  visitAt(region: string, position: Position): void {
    const id = this.chunkAt(region, position);
    if (id) this.visit(region, id);
  }

  chunkAt(region: string, { x, y }: Position): string | undefined {
    const stage = this.regions.get(region);
    if (!stage) return undefined;
    const [w, h] = stage.chunkSize;
    return stage.chunks.find((c) => x >= c.x * w && x < (c.x + 1) * w && y >= c.y * h && y < (c.y + 1) * h)?.id;
  }

  /** Every known room, in story order, with whether it is visited and current. */
  rooms(): Room[] {
    const order = (r: string) => {
      const i = REGION_ORDER.indexOf(r);
      return i < 0 ? REGION_ORDER.length : i; // regions outside the slice go last
    };
    return [...this.regions.values()]
      .sort((a, b) => order(a.region) - order(b.region))
      .flatMap((s) => s.chunks.map((c) => {
        const key = `${s.region}/${c.id}`;
        return {
          region: s.region, id: c.id, gx: c.x, gy: c.y,
          visited: this.visited.has(key), current: this.here === key, saved: this.saves.has(key),
        };
      }));
  }

  /** Saving at a coffee machine records where you are (the stage will also call visitAt as you walk). */
  listen(bus: GameEventBus): () => void {
    return bus.on('save', ({ region, position }) => {
      this.visitAt(region, position);
      const id = this.chunkAt(region, position);
      if (id) this.saves.add(`${region}/${id}`);
    });
  }
}

/** One map for the whole game: the stage marks rooms, the story unlocks it, the screen draws it. */
export const pocketMap = new MapModel();
