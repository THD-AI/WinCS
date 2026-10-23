import type { Box, Geometry } from '../stage/collision';
import type { Body } from './body';
export const CLIMB_SPEED = 70;
export interface Traversal { ladder: Box | null; drop: number; detach: number }
export const traversal = (): Traversal => ({ ladder: null, drop: 0, detach: 0 });

function surfaceNear(geometry: Geometry[], x: number, y: number) {
  const candidates: number[] = [];
  for (const world of geometry) for (const line of [...world.walk, ...world.oneWay]) {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if (x < a[0] || x > b[0]) continue;
      const height = a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
      if (Math.abs(height - y) <= 8) candidates.push(height);
    }
  }
  return candidates.sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0] ?? y;
}

export function dropThrough(body: Body, state: Traversal, geometry: Geometry[]) {
  if (!body.grounded && !state.ladder) return false;
  const support = geometry.some(g => g.oneWay.some(line => line.slice(1).some((b, i) => {
    const a = line[i];
    return body.x >= a[0] && body.x <= b[0]
      && Math.abs(body.y - (a[1] + (body.x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]))) < (state.ladder ? 8 : 0.1);
  })));
  if (!support) return false;
  state.ladder = null; state.drop = 0.22; body.y += 1; body.vy = 30; body.grounded = false;
  return true;
}

/** Returns true while the ladder owns movement, including a stationary hold. */
export function climb(body: Body, state: Traversal, geometry: Geometry[], vertical: number, horizontal: number,
  jumpPressed: boolean, dt: number) {
  state.drop = Math.max(0, state.drop - dt);
  state.detach = Math.max(0, state.detach - dt);
  if (state.ladder && (jumpPressed || Math.abs(horizontal) > 0.2)) {
    state.ladder = null; state.detach = 0.2; body.grounded = jumpPressed; return false;
  }
  if (!state.ladder && vertical && Math.abs(horizontal) <= 0.2 && !jumpPressed && state.drop === 0 && state.detach === 0) {
    state.ladder = geometry.flatMap(g => g.climb).find(b => body.x + 14 > b.x && body.x - 14 < b.x + b.w
      && body.y >= b.y - 4 && body.y <= b.y + b.h + 8) ?? null;
  }
  if (!state.ladder) return false;
  const ladder = state.ladder;
  const x = ladder.x + ladder.w / 2;
  const top = surfaceNear(geometry, x, ladder.y);
  const bottom = surfaceNear(geometry, x, ladder.y + ladder.h);
  body.x = x; body.vx = 0; body.vy = 0; body.sliding = false; body.slope = 0; body.grounded = false;
  body.y = Math.max(top, Math.min(bottom, body.y + vertical * CLIMB_SPEED * dt));
  if (vertical < 0 && body.y <= top || vertical > 0 && body.y >= bottom) {
    state.ladder = null; body.grounded = true;
  }
  return true;
}
