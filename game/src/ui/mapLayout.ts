import { Room } from './mapModel';

/** Where every piece of the pocket computer's map goes, in pixels from the map's top-left (pure, tested). */

export type RoomFrame = 'room-visited' | 'room-current' | 'room-unexplored';
export type MapIcon = 'player-dot' | 'icon-cup' | 'icon-leaf' | 'icon-mountains';

export interface PlacedRoom { room: Room; x: number; y: number; frame: RoomFrame; icon?: MapIcon }
export interface Corridor { x: number; y: number; length: number; vertical: boolean }
export interface MapLayout { rooms: PlacedRoom[]; corridors: Corridor[]; width: number; height: number }

/** Each region's mark, shown in its first room once you've been there (icons only, no text – docs/06). */
export const REGION_ICON: Record<string, MapIcon> = { 'hidden-garden': 'icon-leaf', 'rusty-creek': 'icon-mountains' };

/**
 * Regions you have entered, stacked top to bottom in story order, each on its own chunk grid.
 * Unexplored rooms of an entered region show as dashed outlines (the approved direction); corridors join
 * neighbouring rooms, and the first rooms of consecutive regions (the way you came).
 */
export function layoutMap(rooms: Room[], cell: { w: number; h: number }, gap: number): MapLayout {
  const regions = [...new Set(rooms.map((r) => r.region))]
    .filter((region) => rooms.some((r) => r.region === region && r.visited));
  const placed: PlacedRoom[] = [];
  const corridors: Corridor[] = [];
  const at = (gx: number, row: number) => ({ x: gx * (cell.w + gap), y: row * (cell.h + gap) });
  let row = 0;
  let previousFirst: { x: number; y: number } | undefined;
  for (const region of regions) {
    const inRegion = rooms.filter((r) => r.region === region);
    const rows = Math.max(...inRegion.map((r) => r.gy)) + 1;
    for (const room of inRegion) {
      const { x, y } = at(room.gx, row + room.gy);
      const frame: RoomFrame = room.current ? 'room-current' : room.visited ? 'room-visited' : 'room-unexplored';
      const icon: MapIcon | undefined = room.current ? 'player-dot' : room.saved ? 'icon-cup'
        : room.visited && room.gx === 0 && room.gy === 0 ? REGION_ICON[region] : undefined;
      placed.push({ room, x, y, frame, icon });
    }
    for (const a of inRegion) {
      for (const b of inRegion) {
        const right = b.gy === a.gy && b.gx === a.gx + 1;
        const below = b.gx === a.gx && b.gy === a.gy + 1;
        if (!(right || below) || !(a.visited || b.visited)) continue;
        const p = at(a.gx, row + a.gy);
        corridors.push(right
          ? { x: p.x + cell.w, y: p.y + cell.h / 2, length: gap, vertical: false }
          : { x: p.x + cell.w / 2, y: p.y + cell.h, length: gap, vertical: true });
      }
    }
    const first = at(0, row);
    if (previousFirst) {
      corridors.push({ x: first.x + cell.w / 2, y: previousFirst.y + cell.h, length: first.y - previousFirst.y - cell.h,
        vertical: true });
    }
    previousFirst = at(0, row + rows - 1);
    row += rows;
  }
  const width = placed.length ? Math.max(...placed.map((p) => p.x)) + cell.w : 0;
  const height = placed.length ? Math.max(...placed.map((p) => p.y)) + cell.h : 0;
  return { rooms: placed, corridors, width, height };
}
