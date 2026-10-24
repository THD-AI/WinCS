import type { Box, Geometry, Point } from '../stage/collision';
import { GRAVITY } from './jump';
export const BODY_WIDTH = 28;
export const BODY_HEIGHT = 76;
const HALF = BODY_WIDTH / 2;
/** A rise up to this many px is a step: the grounded body walks up (and down) it without a jump. */
export const STEP_UP = 16;
/**
 * A line end with nothing under it is a ledge face. It stops a body whose feet are more than STEP_UP and at
 * most FACE_REACH below its top – higher ledges are background the hero walks in front of.
 */
export const FACE_REACH = 100;
/** A floor this far under a line's end means the end is an overhang the body passes under, not a face. */
export const FACE_DEPTH = 120;
/** A falling body lands on a floor whose end is at most this far from its centre (half the 28 px body, less a margin). */
export const FOOTHOLD = 8;
export interface Body { x: number; y: number; vx: number; vy: number; grounded: boolean; slope?: number; sliding?: boolean }
export function overlaps(body: Body, box: Box) {
  return body.x + HALF > box.x && body.x - HALF < box.x + box.w
    && body.y > box.y && body.y - BODY_HEIGHT < box.y + box.h;
}

interface Floor { line: Point[]; slide: boolean }
/** Height of a polyline at x and the slope there, or null outside it. */
export function heightAt(line: Point[], x: number): { y: number; slope: number } | null {
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    if (x < a[0] || x > b[0]) continue;
    const slope = (b[1] - a[1]) / (b[0] - a[0]);
    return { y: a[1] + (x - a[0]) * slope, slope };
  }
  return null;
}
function floors(geometry: Geometry[], ignoreOneWay: boolean): Floor[] {
  return geometry.flatMap(world => [
    ...world.walk.map(line => ({ line, slide: false })),
    ...world.slide.map(line => ({ line, slide: true })),
    ...(ignoreOneWay ? [] : world.oneWay.map(line => ({ line, slide: false }))),
  ]);
}

/**
 * The ledge faces of the terrain: the ends of walk and slide lines that nothing passes under. A tier of the
 * terrace, the wall top after the stepping stones, a raised trail whose lower trail stops at its foot – each is a
 * wall up to its top. A raised platform with the trail running on in front of it (the bench) is not.
 */
export type Face = { x: number; top: number; side: -1 | 1 };
const cache = new WeakMap<Geometry, { worlds: Geometry[]; faces: Face[] }>();
export function faces(geometry: Geometry[]): Face[] {
  if (!geometry.length) return [];
  const hit = cache.get(geometry[0]);
  if (hit && hit.worlds.length === geometry.length && hit.worlds.every((w, i) => w === geometry[i])) return hit.faces;
  const out = findFaces(geometry);
  cache.set(geometry[0], { worlds: [...geometry], faces: out });
  return out;
}
function findFaces(geometry: Geometry[]): Face[] {
  const all = geometry.flatMap(world => [...world.walk, ...world.slide]);
  const under = [...all, ...geometry.flatMap(world => world.oneWay)];
  const out: Face[] = [];
  for (const line of all) for (const [end, side] of [[line[0], -1], [line[line.length - 1], 1]] as const) {
    const inside = end[0] - side;
    const passes = under.some(other => {
      if (other === line) return false;
      const h = heightAt(other, inside)?.y;
      return h !== undefined && h > end[1] + STEP_UP && h <= end[1] + FACE_DEPTH;
    });
    const continues = under.some(other => other !== line && Math.abs((heightAt(other, end[0] + side)?.y ?? -1e9) - end[1]) <= STEP_UP);
    if (!passes && !continues) out.push({ x: end[0], top: end[1], side });
  }
  return out;
}

/**
 * Feet origin. Floors are polylines; the body walks along them, steps up and down rises of STEP_UP or less,
 * is stopped by solids and ledge faces, and slides only on authored `slide` lines.
 */
export function stepBody(body: Body, geometry: Geometry[], dt: number, ignoreOneWay = false) {
  const oldX = body.x, oldY = body.y;
  const wasGrounded = body.grounded;
  if (body.sliding && wasGrounded && body.vy >= 0) {
    const slope = body.slope ?? 0;
    const acceleration = GRAVITY * slope / (1 + slope * slope);
    body.vx = Math.max(-420, Math.min(420, body.vx + acceleration * dt));
  }
  body.x += body.vx * dt;
  const solids = geometry.flatMap(world => world.solid);
  for (const wall of solids) {
    if (oldY <= wall.y || oldY - BODY_HEIGHT >= wall.y + wall.h) continue;
    // A solid whose top is a step above grounded feet is walked onto, not into.
    if (wasGrounded && body.vy >= 0 && oldY - wall.y <= STEP_UP) continue;
    if (body.vx > 0 && oldX + HALF <= wall.x && body.x + HALF > wall.x) {
      body.x = wall.x - HALF; body.vx = 0;
    } else if (body.vx < 0 && oldX - HALF >= wall.x + wall.w && body.x - HALF < wall.x + wall.w) {
      body.x = wall.x + wall.w + HALF; body.vx = 0;
    }
  }
  for (const face of faces(geometry)) {
    const rise = oldY - face.top;
    if (rise <= (wasGrounded ? STEP_UP : 0.5) || rise > FACE_REACH) continue;
    if (face.side < 0 && body.vx > 0 && oldX + HALF <= face.x && body.x + HALF > face.x) {
      body.x = face.x - HALF; body.vx = 0;
    } else if (face.side > 0 && body.vx < 0 && oldX - HALF >= face.x && body.x - HALF < face.x) {
      body.x = face.x + HALF; body.vx = 0;
    }
  }
  body.vy = Math.min(900, body.vy + GRAVITY * dt);
  let nextY = body.y + body.vy * dt;
  body.grounded = false;
  body.sliding = false;
  body.slope = 0;
  const surfaces: { y: number; slope: number; slide: boolean }[] = [];
  const holds: typeof surfaces = [];
  for (const floor of floors(geometry, ignoreOneWay)) {
    const h = heightAt(floor.line, body.x);
    if (h) surfaces.push({ ...h, slide: floor.slide });
    else {
      // Feet overhang: with no floor under the centre, a floor end up to FOOTHOLD px away still holds (a stepping stone's edge).
      const [first, last] = [floor.line[0], floor.line[floor.line.length - 1]];
      const end = body.x < first[0] && first[0] - body.x <= FOOTHOLD ? first : body.x > last[0] && body.x - last[0] <= FOOTHOLD ? last : null;
      if (end) holds.push({ y: end[1], slope: 0, slide: floor.slide });
    }
  }
  if (!surfaces.length) surfaces.push(...holds);
  for (const wall of solids) {
    if (body.x + HALF > wall.x && body.x - HALF < wall.x + wall.w) surfaces.push({ y: wall.y, slope: 0, slide: false });
  }
  let contact: { y: number; slope: number; slide: boolean } | undefined;
  if (body.vy >= 0) {
    if (wasGrounded) {
      // Stay on the ground: follow the floor, step down a step, or step up onto the highest floor a step above.
      const reach = STEP_UP + Math.abs(body.x - oldX) * 1.2 + 0.1;
      contact = surfaces.filter(s => Math.abs(s.y - oldY) <= reach)
        .sort((a, b) => a.y - b.y)[0];
    }
    // Falling: land on the first floor the feet cross from above.
    contact ??= surfaces.filter(s => oldY <= s.y + 0.01 && nextY >= s.y).sort((a, b) => a.y - b.y)[0];
  }
  if (contact) {
    nextY = contact.y; body.vy = 0; body.grounded = true; body.slope = contact.slope;
    body.sliding = contact.slide && Math.abs(contact.slope) > 0.05;
  } else if (body.vy < 0) {
    for (const wall of solids) {
      if (body.x + HALF <= wall.x || body.x - HALF >= wall.x + wall.w) continue;
      if (oldY - BODY_HEIGHT >= wall.y + wall.h && nextY - BODY_HEIGHT < wall.y + wall.h) {
        nextY = wall.y + wall.h + BODY_HEIGHT; body.vy = 0;
      }
    }
  }
  body.y = nextY;
}
