import { describe, expect, it } from 'vitest';
import { JENNY_BOX } from './jenny';
import { GRAVITY, JUMP_SPEED } from '../player/jump';
import arena from '../../../art/stages/rusty-creek/rc-2-1.anomaly.collision.json';

/** The platforms (arena-platform board, scripts/arena_platforms.py): girders this thick, hung on chains. */
const BEAM = 25;

/** The walk line's height at x (the lowest line under it). */
function floorAt(x: number): number {
  let best = -Infinity;
  for (const line of arena.walk) for (let i = 1; i < line.length; i++) {
    const [[ax, ay], [bx, by]] = [line[i - 1], line[i]];
    if (x >= ax && x <= bx) best = Math.max(best, ay + (by - ay) * (x - ax) / Math.max(1, bx - ax));
  }
  return best;
}

describe("Jenny's arena platforms (playtest J6)", () => {
  const gate = arena.interact.find(b => b.kind === 'boss-gate')!;
  const jenny = arena.spawn.find(s => s.kind === 'jenny')!;
  const platforms = arena.oneWay.filter(line => line[0][0] > gate.x && line[0][1] > jenny.y - 120);

  it('has two platforms over her floor', () => {
    expect(platforms).toHaveLength(2);
  });

  it('are reachable with a full jump, and high enough that she drives under them', () => {
    const jump = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    for (const [[x0, y], [x1]] of platforms) {
      // The hero jumps from the walk line under the platform; she drives flat at her spawn's height.
      const ground = Math.min(floorAt(x0), floorAt(x1));
      expect(ground - y, `platform at x ${x0}`).toBeLessThanOrEqual(jump - 4);
      expect(y + BEAM, `platform at x ${x0}`).toBeLessThanOrEqual(jenny.y - JENNY_BOX.h);
    }
  });
});
