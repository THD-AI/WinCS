import { describe, expect, it } from 'vitest';
import { layoutMap } from './mapLayout';
import { MapModel, StageManifest } from './mapModel';

const creek: StageManifest = {
  region: 'rusty-creek', chunkSize: [2160, 720],
  chunks: [{ id: 'rc-0-0', x: 0, y: 0 }, { id: 'rc-1-0', x: 1, y: 0 }, { id: 'rc-2-0', x: 2, y: 0 }],
};
const garden: StageManifest = { region: 'hidden-garden', chunkSize: [2160, 720], chunks: [{ id: 'hg-0-0', x: 0, y: 0 }] };
const CELL = { w: 100, h: 50 };
const GAP = 20;

function walked(): MapModel {
  const m = new MapModel();
  m.addRegion(creek);
  m.addRegion(garden);
  m.visit('hidden-garden', 'hg-0-0');
  m.visit('rusty-creek', 'rc-0-0');
  m.visit('rusty-creek', 'rc-1-0');
  return m;
}

describe('the map layout', () => {
  it('shows nothing before you have been anywhere', () => {
    const m = new MapModel();
    m.addRegion(creek);
    expect(layoutMap(m.rooms(), CELL, GAP)).toMatchObject({ rooms: [], corridors: [], width: 0, height: 0 });
  });

  it('stacks the regions you entered, garden above the creek, on their chunk grid', () => {
    const { rooms, width, height } = layoutMap(walked().rooms(), CELL, GAP);
    const at = Object.fromEntries(rooms.map((p) => [p.room.id, [p.x, p.y]]));
    expect(at).toEqual({ 'hg-0-0': [0, 0], 'rc-0-0': [0, 70], 'rc-1-0': [120, 70], 'rc-2-0': [240, 70] });
    expect([width, height]).toEqual([340, 120]);
  });

  it('marks the current room with the dot, region starts with their icon, unexplored rooms dashed', () => {
    const { rooms } = layoutMap(walked().rooms(), CELL, GAP);
    const by = Object.fromEntries(rooms.map((p) => [p.room.id, p]));
    expect(by['rc-1-0']).toMatchObject({ frame: 'room-current', icon: 'player-dot' });
    expect(by['hg-0-0']).toMatchObject({ frame: 'room-visited', icon: 'icon-leaf' });
    expect(by['rc-0-0']).toMatchObject({ frame: 'room-visited', icon: 'icon-mountains' });
    expect(by['rc-2-0']).toMatchObject({ frame: 'room-unexplored', icon: undefined });
  });

  it('joins neighbours and the way between regions with corridors', () => {
    const { corridors } = layoutMap(walked().rooms(), CELL, GAP);
    expect(corridors).toContainEqual({ x: 100, y: 95, length: 20, vertical: false });  // rc-0 → rc-1
    expect(corridors).toContainEqual({ x: 220, y: 95, length: 20, vertical: false });  // rc-1 → rc-2 (seen from rc-1)
    expect(corridors).toContainEqual({ x: 50, y: 50, length: 20, vertical: true });    // garden → creek
    expect(corridors).toHaveLength(3);
  });
});
