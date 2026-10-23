import { describe, expect, it } from 'vitest';
import { GameEventBus } from '../core/events';
import { MapModel, StageManifest } from './mapModel';

const creek: StageManifest = {
  region: 'rusty-creek', chunkSize: [2160, 720],
  chunks: [{ id: 'rc-0-0', x: 0, y: 0 }, { id: 'rc-1-0', x: 1, y: 0 }, { id: 'rc-2-0', x: 2, y: 0 }],
};
const garden: StageManifest = { region: 'hidden-garden', chunkSize: [2160, 720], chunks: [{ id: 'hg-0-0', x: 0, y: 0 }] };

function model(): MapModel {
  const m = new MapModel();
  m.addRegion(creek);
  m.addRegion(garden);
  return m;
}

describe('the pocket computer map', () => {
  it('starts locked with every room dark', () => {
    const m = model();
    expect(m.unlocked).toBe(false);
    expect(m.rooms().some((r) => r.visited)).toBe(false);
  });

  it('lists regions in story order, garden first', () => {
    expect(model().rooms().map((r) => r.id)).toEqual(['hg-0-0', 'rc-0-0', 'rc-1-0', 'rc-2-0']);
  });

  it('finds the room a position is in, and nothing outside the chunks', () => {
    const m = model();
    expect(m.chunkAt('rusty-creek', { x: 0, y: 10 })).toBe('rc-0-0');
    expect(m.chunkAt('rusty-creek', { x: 2160, y: 700 })).toBe('rc-1-0');
    expect(m.chunkAt('rusty-creek', { x: 6480, y: 0 })).toBeUndefined();
    expect(m.chunkAt('rusty-creek', { x: 10, y: 720 })).toBeUndefined();
    expect(m.chunkAt('nowhere', { x: 0, y: 0 })).toBeUndefined();
  });

  it('fills rooms in as you visit them and keeps one current room', () => {
    const m = model();
    m.visitAt('rusty-creek', { x: 100, y: 300 });
    m.visitAt('rusty-creek', { x: 2500, y: 300 });
    const rooms = Object.fromEntries(m.rooms().map((r) => [r.id, r]));
    expect(rooms['rc-0-0']).toMatchObject({ visited: true, current: false });
    expect(rooms['rc-1-0']).toMatchObject({ visited: true, current: true });
    expect(rooms['rc-2-0'].visited).toBe(false);
  });

  it('marks the room you save in', () => {
    const m = model();
    const bus = new GameEventBus();
    const stop = m.listen(bus);
    bus.emit('save', { checkpoint: 'coffee', region: 'rusty-creek', position: { x: 4400, y: 400 } });
    expect(m.rooms().find((r) => r.id === 'rc-2-0')?.current).toBe(true);
    stop();
  });

  it('opens only after Dexter hands it over', () => {
    const m = model();
    m.unlock();
    expect(m.unlocked).toBe(true);
  });
});
