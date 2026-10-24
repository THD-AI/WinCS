import { describe, expect, it } from 'vitest';
import type { CollisionChunk } from './collision';
import { Triggers } from './triggers';

const chunk = (interact: object[]) => ({ world: { interact } }) as unknown as CollisionChunk;
const body = (x: number, y: number) => ({ x, y, vx: 0, vy: 0, grounded: true });

describe('interact triggers', () => {
  // Hidden Garden hg-4-0: the pond edge, 70 × 76 at (1250, 365) in chunk space.
  const pond = { id: 'pond-edge', kind: 'anomaly', x: 1250, y: 365, w: 70, h: 76 };

  it('fires once on entry and again only after leaving', () => {
    const triggers = new Triggers([chunk([pond])], 'hidden-garden');
    expect(triggers.step(body(1200, 441))).toEqual([]);
    expect(triggers.step(body(1260, 441))).toEqual([pond]);
    expect(triggers.step(body(1280, 441))).toEqual([]);
    expect(triggers.step(body(1400, 441))).toEqual([]);
    expect(triggers.step(body(1300, 441))).toEqual([pond]);
  });

  it('ignores boxes without an id or kind', () => {
    const triggers = new Triggers([chunk([{ x: 0, y: 0, w: 100, h: 100 }, pond])], 'hidden-garden');
    expect(triggers.step(body(50, 90))).toEqual([]);
  });
});
