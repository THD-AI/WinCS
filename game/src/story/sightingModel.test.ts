import { describe, expect, it } from 'vitest';
import { SIGHTING, sightingMarkers, sightingPhase } from './sightingModel';
import type { Geometry } from '../stage/collision';

const world = (spawn: Geometry['spawn']): Geometry => ({ walk: [], slide: [], oneWay: [], solid: [], climb: [], noGo: [],
  hazard: [], interact: [], spawn, ledge: [], glideLift: [] });

describe('Dexter in the rooms', () => {
  // The cellar's sighting: upstairs in hg-2-1, at x 4320 + 1500, on the floor at 720 + 341.
  const cellar = { x: 5820, y: 1061 };

  it('stays while you are in another room or far off, and flickers away when you come close', () => {
    expect(sightingPhase({ x: 5820, y: 650 }, cellar, undefined)).toBe('there');             // right above, in the garden
    expect(sightingPhase({ x: 5820 - SIGHTING.near - 1, y: 1327 }, cellar, undefined)).toBe('there');
    expect(sightingPhase({ x: 5820 - SIGHTING.near + 1, y: 1327 }, cellar, undefined)).toBe('flicker');
    expect(sightingPhase({ x: 4400, y: 1327 }, cellar, 0.05)).toBe('flicker');                // going, wherever you are
    expect(sightingPhase({ x: 4400, y: 1327 }, cellar, SIGHTING.flicker)).toBe('gone');
  });

  it('a sighting standing on the row\'s top edge still belongs to its row', () => {
    expect(sightingPhase({ x: 100, y: 1300 }, { x: 120, y: 1440 }, undefined)).toBe('flicker');
  });

  it('reads only the sighting markers', () => {
    const chunks = [{ world: world([{ id: 'dexter-bench', kind: 'dexter', x: 1, y: 1 },
      { id: 'dexter-cellar', kind: 'dexter-sighting', x: 5820, y: 1061, act: 'beckon', face: -1 }]) }];
    expect(sightingMarkers(chunks).map(m => m.id)).toEqual(['dexter-cellar']);
  });
});
