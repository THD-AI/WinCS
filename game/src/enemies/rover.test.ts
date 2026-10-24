import { describe, expect, it } from 'vitest';
import { Rover, CHARGE_SPEED, PATROL_SPEED } from './rover';
import { parseCollision, placeCollision } from '../stage/collision';
import type { Damageable } from '../combat/sweeps';
import { Sweeps, intersects } from '../combat/sweeps';
import raw from '../../../art/stages/rusty-creek/rc-0-0.anomaly.collision.json';

const tutorial = () => {
  const spawn = placeCollision(parseCollision(raw, 'rc-0-0', 'anomaly'), [0, 0]).world.spawn.find(point => point.kind === 'rover')!;
  return new Rover({ x: spawn.x, y: spawn.y }, spawn.patrol as [number, number]);
};
describe('autonomous rover', () => {
  it('patrols the real tutorial range at half walking speed without leaving its deck', () => {
    const rover = tutorial(); expect(rover.patrol).toEqual([640, 880]);
    expect(rover.bounds).toEqual({ x: 744.5, y: 483, w: 31, h: 25 });
    expect(PATROL_SPEED).toBeCloseTo(2.2 * 43 / 2); rover.step(1); expect(rover.x).toBeCloseTo(760 + PATROL_SPEED);
    for (let n = 0; n < 30; n++) { rover.step(0.1); expect(rover.x).toBeGreaterThanOrEqual(640); expect(rover.x).toBeLessThanOrEqual(880); }
  });
  it('shows red lidar and rear-up for exactly half a second before a locked straight charge', () => {
    const rover = tutorial(); rover.step(1 / 120, { x: 840, y: 508 });
    expect(rover.phase).toBe('tell'); expect(rover.pose).toBe('charge-00');
    rover.step(0.25); expect(rover.pose).toBe('charge-01'); expect(rover.x).toBe(760);
    rover.step(0.25); expect(rover.phase).toBe('charge'); expect(CHARGE_SPEED).toBeCloseTo(4.6 * 43);
    rover.step(0.1, { x: 700, y: 400 }); expect(rover.x).toBeCloseTo(760 + CHARGE_SPEED * 0.1, 1); expect(rover.direction).toBe(1);
    rover.step(1); expect(rover.x).toBeLessThanOrEqual(880);
  });
  it('spots only forward within the documented tuning band', () => {
    for (const hero of [{ x: 700, y: 508 }, { x: 920, y: 508 }, { x: 800, y: 400 }]) {
      const rover = tutorial(); rover.step(1 / 120, hero); expect(rover.phase).toBe('patrol');
    }
  });
  it('accepts three separate sweeps, plays the five wreck poses, and signals defeat once', () => {
    const rover = tutorial(), sweep = new Sweeps(), hero = { x: 730, y: 508 };
    const target: Damageable = { id: 'rover-1', bounds: () => rover.bounds, hit: hit => rover.hit(hit.damage, hit.direction) };
    for (let n = 0; n < 3; n++) {
      hero.x = rover.x - 30;
      sweep.press(1); sweep.step((n % 2 ? 3 : 4) / 12);
      expect(sweep.hit(hero, [target])).toHaveLength(1);
      expect(sweep.hit(hero, [target])).toHaveLength(0);
      expect(rover.health).toBe(2 - n);
      if (n < 2) rover.step(3 / 12);
      sweep.step(1);
    }
    expect(rover.phase).toBe('wreck'); expect(rover.pose).toBe('wreck-00');
    expect(rover.step(4 / 12)).toBe(false); expect(rover.pose).toBe('wreck-04');
    expect(rover.step(1 / 12)).toBe(true); expect(rover.phase).toBe('dead');
    expect(rover.step(2)).toBe(false); expect(rover.hit(1, 1)).toBe(false);
    rover.reset(); expect(rover.health).toBe(3); expect(rover.x).toBe(760);
  });
  it('uses three-frame hit recovery and lets the hero jump clear of the body', () => {
    const rover = tutorial(); expect(rover.hit(1, -1)).toBe(true); expect(rover.hit(1, -1)).toBe(false);
    rover.step(3 / 12); expect(rover.x).toBeCloseTo(744.5); expect(rover.phase).toBe('patrol');
    expect(intersects(rover.bounds, { x: 730, y: 360, w: 28, h: 76 })).toBe(false);
    expect(intersects(rover.bounds, { x: 730, y: 432, w: 28, h: 76 })).toBe(true);
  });
});
