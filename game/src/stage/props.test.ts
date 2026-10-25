import { describe, expect, it } from 'vitest';
import { bob, EYES_NARROW, EYES_NOTICE, EyesModel, propMarkers } from './props';
import type { Geometry } from './collision';

const world = (spawn: Geometry['spawn']): Geometry => ({ walk: [], slide: [], oneWay: [], solid: [], climb: [], noGo: [],
  hazard: [], interact: [], spawn, ledge: [], glideLift: [] });

describe('story props', () => {
  it('picks the props out of the spawn markers', () => {
    const chunks = [{ world: world([{ id: 'p', kind: 'player', x: 0, y: 0 }, { id: 'r', kind: 'rover', x: 1, y: 1 },
      { id: 'b', kind: 'balloon', x: 7240, y: 840, rise: 98 }, { id: 'e', kind: 'pipe-eyes', x: 7371, y: 1303 },
      { id: 'boat', kind: 'paper-boat', x: 7440, y: 1370 }]) }];
    expect(propMarkers(chunks).map(m => m.kind)).toEqual(['balloon', 'pipe-eyes', 'paper-boat']);
  });

  it('the eyes watch until you come close in their room, narrow, and are gone for good', () => {
    const eyes = new EyesModel(7371, 1303);
    expect(eyes.step({ x: 7371, y: 650 }, 16)).toBe('watching');               // right above, in the garden row
    expect(eyes.step({ x: 7371 - EYES_NOTICE - 10, y: 1370 }, 16)).toBe('watching');
    expect(eyes.step({ x: 7371 - EYES_NOTICE + 10, y: 1370 }, 16)).toBe('narrowed');
    expect(eyes.step({ x: 6000, y: 1370 }, EYES_NARROW - 1)).toBe('narrowed');  // walking away does not bring them back
    expect(eyes.step({ x: 6000, y: 1370 }, 2)).toBe('gone');
    expect(eyes.step({ x: 9000, y: 1370 }, 5000)).toBe('gone');
  });

  it('the balloon only ever pushes up against the ceiling, by a pixel or two', () => {
    const offsets = Array.from({ length: 200 }, (_, i) => bob(i * 50));
    expect(Math.min(...offsets)).toBe(0);
    expect(Math.max(...offsets)).toBe(2);
  });
});
