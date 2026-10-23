import type { Box, Geometry } from '../stage/collision';
export const BODY_WIDTH = 28;
export const BODY_HEIGHT = 76;
export interface Body { x: number; y: number; vx: number; vy: number; grounded: boolean }
export function overlaps(body: Body, box: Box) {
  return body.x + 14 > box.x && body.x - 14 < box.x + box.w
    && body.y > box.y && body.y - BODY_HEIGHT < box.y + box.h;
}

/** Feet origin, swept wall/floor checks. Slope and one-way policies follow separately. */
export function stepBody(body: Body, geometry: Geometry[], dt: number) {
  const oldX = body.x, oldY = body.y;
  body.x += body.vx * dt;
  for (const world of geometry) for (const wall of world.solid) {
    if (oldY <= wall.y || oldY - BODY_HEIGHT >= wall.y + wall.h) continue;
    if (body.vx > 0 && oldX + 14 <= wall.x && body.x + 14 > wall.x) {
      body.x = wall.x - 14; body.vx = 0;
    } else if (body.vx < 0 && oldX - 14 >= wall.x + wall.w && body.x - 14 < wall.x + wall.w) {
      body.x = wall.x + wall.w + 14; body.vx = 0;
    }
  }
  body.vy = Math.min(900, body.vy + 1200 * dt);
  let nextY = body.y + body.vy * dt;
  body.grounded = false;
  for (const world of geometry) {
    for (const line of world.walk) for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if (a[1] !== b[1] || body.x < a[0] || body.x > b[0]) continue;
      if (body.vy >= 0 && oldY <= a[1] + 0.01 && nextY >= a[1]) {
        nextY = a[1]; body.vy = 0; body.grounded = true;
      }
    }
    for (const wall of world.solid) {
      if (body.x + 14 <= wall.x || body.x - 14 >= wall.x + wall.w) continue;
      if (body.vy >= 0 && oldY <= wall.y && nextY >= wall.y) {
        nextY = wall.y; body.vy = 0; body.grounded = true;
      } else if (body.vy < 0 && oldY - BODY_HEIGHT >= wall.y + wall.h && nextY - BODY_HEIGHT < wall.y + wall.h) {
        nextY = wall.y + wall.h + BODY_HEIGHT; body.vy = 0;
      }
    }
  }
  body.y = nextY;
}
