import type { Box, Geometry } from '../stage/collision';
import type { Body } from './body';
export const CLIMB_SPEED = 70;
/**
 * The climb is never mirrored: the ladder clip already alternates the arms (frame 2 reaches with the left), and a
 * mirrored back reads the poncho's THD as DHT (Alexander's playtest, 25 Oct). It replaced the rung-step flip of 24 Oct.
 */
/**
 * Getting on and off a ladder (Alexander, 24 Oct): the hero-ladder board's clips, played forward when he leaves the
 * ladder and reversed when he takes it. ladder-top: hauled up over the deck edge to a stand; ladder-bottom: off the
 * lowest rung onto the ground. The body holds still at that end of the ladder for the clip's length (4 and 3 frames
 * at 12 fps), never longer; a jump ends the hold.
 */
export type LadderEnd = { clip: 'ladder-top' | 'ladder-bottom'; reverse: boolean };
export const LADDER_TOP_TIME = 4 / 12;
export const LADDER_BOTTOM_TIME = 3 / 12;
/** px from the end of a ladder within which a grab counts as getting on at that end. */
const END_REACH = 4;
/**
 * `hold`: seconds the body still waits at a ladder end while its clip plays (on the ladder: getting on; off it:
 * getting off). `end`: the clip to start, taken once by the player (takeLadderEnd).
 */
export interface Traversal { ladder: Box | null; drop: number; detach: number; hold: number; end: LadderEnd | null }
export const traversal = (): Traversal => ({ ladder: null, drop: 0, detach: 0, hold: 0, end: null });
/** The ladder end that started since the last call, if any; clears it. */
export function takeLadderEnd(state: Traversal) {
  const end = state.end;
  state.end = null;
  return end;
}
/** Counts a hold down; the last float crumbs of a 1/120 s substep count as done. */
const tick = (hold: number, dt: number) => hold - dt > 1e-9 ? hold - dt : 0;
function ladderEnds(geometry: Geometry[], ladder: Box) {
  const x = ladder.x + ladder.w / 2;
  return { x, top: surfaceNear(geometry, x, ladder.y), bottom: surfaceNear(geometry, x, ladder.y + ladder.h) };
}

/** The walk or one-way surface within 8 px of (x, y), else y. */
export function surfaceNear(geometry: Geometry[], x: number, y: number) {
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
  state.ladder = null; state.hold = 0; state.drop = 0.22; body.y += 1; body.vy = 30; body.grounded = false;
  return true;
}

/** Returns true while the ladder owns movement, including a stationary hold. */
export function climb(body: Body, state: Traversal, geometry: Geometry[], vertical: number, horizontal: number,
  jumpPressed: boolean, dt: number) {
  state.drop = Math.max(0, state.drop - dt);
  state.detach = Math.max(0, state.detach - dt);
  if (state.ladder && (jumpPressed || Math.abs(horizontal) > 0.2)) {
    state.ladder = null; state.hold = 0; state.detach = 0.2; body.grounded = jumpPressed; return false;
  }
  // Just off the ladder: standing at its end while ladder-top or ladder-bottom plays.
  if (!state.ladder && state.hold > 0) {
    if (jumpPressed) { state.hold = 0; return false; }
    state.hold = tick(state.hold, dt);
    body.vx = 0; body.vy = 0; body.sliding = false; body.grounded = true;
    return true;
  }
  if (!state.ladder && vertical && Math.abs(horizontal) <= 0.2 && !jumpPressed && state.drop === 0 && state.detach === 0) {
    const ladder = geometry.flatMap(g => g.climb).find(b => body.x + 14 > b.x && body.x - 14 < b.x + b.w
      && body.y >= b.y - 4 && body.y <= b.y + b.h + 8);
    if (ladder) {
      const { top, bottom } = ladderEnds(geometry, ladder);
      // Only a press that leads along the ladder takes it: Up at its top (or Down at its foot) has nowhere to go,
      // and used to grab and let go again every substep.
      if (vertical < 0 ? body.y > top + 0.5 : body.y < bottom - 0.5) {
        state.ladder = ladder;
        const end: LadderEnd['clip'] | null = vertical > 0 && body.y <= top + END_REACH ? 'ladder-top'
          : vertical < 0 && body.y >= bottom - END_REACH ? 'ladder-bottom' : null;
        if (end) { state.end = { clip: end, reverse: true }; state.hold = end === 'ladder-top' ? LADDER_TOP_TIME : LADDER_BOTTOM_TIME; }
      }
    }
  }
  if (!state.ladder) return false;
  const { x, top, bottom } = ladderEnds(geometry, state.ladder);
  body.x = x; body.vx = 0; body.vy = 0; body.sliding = false; body.slope = 0; body.grounded = false;
  // Getting on: the body waits at the end while the reversed clip plays. Like the climb clip, it only runs while a
  // direction is held (the player stops the animation clock on a ladder without input).
  if (state.hold > 0) {
    if (vertical) state.hold = tick(state.hold, dt);
    body.y = Math.max(top, Math.min(bottom, body.y));
    return true;
  }
  body.y = Math.max(top, Math.min(bottom, body.y + vertical * CLIMB_SPEED * dt));
  if (vertical < 0 && body.y <= top || vertical > 0 && body.y >= bottom) {
    state.ladder = null; body.grounded = true;
    state.end = { clip: vertical < 0 ? 'ladder-top' : 'ladder-bottom', reverse: false };
    state.hold = vertical < 0 ? LADDER_TOP_TIME : LADDER_BOTTOM_TIME;
  }
  return true;
}

/** The y below which the hero has fallen out of the region: the lowest chunk's bottom and 180 px (was y 900 for one row). */
export function fallLine(chunks: { origin: readonly [number, number] | number[] }[]): number {
  return Math.max(0, ...chunks.map(c => c.origin[1])) + 720 + 180;
}
