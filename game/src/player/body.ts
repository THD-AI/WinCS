import type { Box, Geometry } from '../stage/collision';
import { GRAVITY } from './jump';
export const BODY_WIDTH = 28;
export const BODY_HEIGHT = 76;
export interface Body { x: number; y: number; vx: number; vy: number; grounded: boolean; slope?: number; sliding?: boolean }
export function overlaps(body: Body, box: Box) {
  return body.x + 14 > box.x && body.x - 14 < box.x + box.w
    && body.y > box.y && body.y - BODY_HEIGHT < box.y + box.h;
}

/** Feet origin and continuous polylines; one-way policy follows separately. */
export function stepBody(body: Body, geometry: Geometry[], dt: number, ignoreOneWay = false) {
  const oldX = body.x, oldY = body.y;
  const wasGrounded = body.grounded;
  const oldSlope = body.slope ?? 0;
  if (body.sliding && wasGrounded && body.vy >= 0) {
    const slope = body.slope ?? 0;
    const acceleration = GRAVITY * slope / (1 + slope * slope);
    body.vx = Math.max(-420, Math.min(420, body.vx + acceleration * dt));
  }
  body.x += body.vx * dt;
  for (const world of geometry) for (const wall of world.solid) {
    if (oldY <= wall.y || oldY - BODY_HEIGHT >= wall.y + wall.h) continue;
    if (body.vx > 0 && oldX + 14 <= wall.x && body.x + 14 > wall.x) {
      body.x = wall.x - 14; body.vx = 0;
    } else if (body.vx < 0 && oldX - 14 >= wall.x + wall.w && body.x - 14 < wall.x + wall.w) {
      body.x = wall.x + wall.w + 14; body.vx = 0;
    }
  }
  body.vy = Math.min(900, body.vy + GRAVITY * dt);
  let nextY = body.y + body.vy * dt;
  body.grounded = false;
  body.sliding = false;
  body.slope = 0;
  for (const world of geometry) {
    for (const line of [...world.walk, ...world.slide, ...(ignoreOneWay ? [] : world.oneWay)]) for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if (body.x < a[0] || body.x > b[0]) continue;
      const slope = (b[1] - a[1]) / (b[0] - a[0]);
      const surface = a[1] + (body.x - a[0]) * slope;
      const follows = wasGrounded && Math.abs(surface - oldY)
        <= Math.abs(body.x - oldX) * Math.max(Math.abs(slope), Math.abs(oldSlope)) + 0.1;
      if (body.vy >= 0 && (follows || oldY <= surface + 0.01 && nextY >= surface)) {
        nextY = surface; body.vy = 0; body.grounded = true; body.slope = slope;
        body.sliding = Math.abs(Math.atan(slope)) > 40 * Math.PI / 180 + 1e-9;
      }
    }
    for (const wall of world.solid) {
      if (body.x + 14 <= wall.x || body.x - 14 >= wall.x + wall.w) continue;
      if (body.vy >= 0 && oldY <= wall.y && nextY >= wall.y) {
        nextY = wall.y; body.vy = 0; body.grounded = true; body.slope = 0; body.sliding = false;
      } else if (body.vy < 0 && oldY - BODY_HEIGHT >= wall.y + wall.h && nextY - BODY_HEIGHT < wall.y + wall.h) {
        nextY = wall.y + wall.h + BODY_HEIGHT; body.vy = 0;
      }
    }
  }
  body.y = nextY;
}
