import { describe, expect, it } from 'vitest';
import { chickenFrame, chickens, SQUEEZE_MS } from './chickenModel';
import type { Geometry } from './collision';
import garden from '../../../art/stages/hidden-garden/hg-0-0.clean.collision.json';

const world = (interact: Geometry['interact']) => ({ world: { interact } as Geometry });

describe('the rubber chicken', () => {
  it('is hidden in the garden, left of where you start', () => {
    const [chicken] = chickens([world(garden.interact as Geometry['interact'])]);
    const start = garden.spawn.find(s => s.kind === 'player')!;
    expect(chicken.id).toBe('rubber-chicken');
    expect(chicken.x + chicken.w).toBeLessThan(start.x);
  });
  it('shows its squeezed frame for a moment after each squeeze', () => {
    expect(chickenFrame(undefined)).toBe('rest-00');
    expect(chickenFrame(0)).toBe('squeak-00');
    expect(chickenFrame(SQUEEZE_MS)).toBe('rest-00');
  });
});
