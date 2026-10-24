import { gameEvents } from '../core/events';
import { overlaps, type Body } from '../player/body';
import type { Box, CollisionChunk } from './collision';

/**
 * Edge detection over the authored `interact` boxes (docs/13 contract): a box fires once when the hero's body
 * enters it and again only after the body has left. Story and UI react by kind – `anomaly`, `jenny-ram`,
 * `boss-gate`, `dexter-waypoint`, `chunk-exit` … – through `trigger-entered`.
 */
export class Triggers {
  private readonly boxes: Box[];
  private inside = new Set<Box>();

  constructor(chunks: CollisionChunk[], private region: string) {
    this.boxes = chunks.flatMap(chunk => chunk.world.interact).filter(box => box.id && box.kind);
  }

  /** The boxes the body entered since the last step. */
  step(body: Body): Box[] {
    const entered: Box[] = [];
    for (const box of this.boxes) {
      const now = overlaps(body, box);
      if (now && !this.inside.has(box)) entered.push(box);
      if (now) this.inside.add(box); else this.inside.delete(box);
    }
    return entered;
  }

  emit(body: Body): void {
    for (const box of this.step(body)) {
      gameEvents.emit('trigger-entered', { id: box.id!, kind: box.kind!, region: this.region, position: { x: body.x, y: body.y } });
    }
  }
}
