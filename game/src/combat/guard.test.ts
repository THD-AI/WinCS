import { describe, expect, it } from 'vitest';
import { Guard, GuardPush } from './guard';
import { Life } from './life';
import { Rover, ROVER_WIDTH } from '../enemies/rover';
import { stepBody, type Body } from '../player/body';
import type { Geometry } from '../stage/collision';
import clips from '../../public/assets/sprites/chair-block.anims.json';
describe('chair guard', () => {
  it('activates at forward-leg pose 02 and loops the approved hold poses', () => {
    for (const name of ['guard-up', 'guard-hold', 'guard-impact', 'guard-break'] as const) expect(clips[name].fps).toBe(12);
    expect(clips['guard-up'].frames).toBe(4); expect(clips['guard-hold'].frames).toBe(3);
    const guard = new Guard(); guard.press(1); expect(guard.pose).toBe('guard-up-00');
    guard.step(1 / 12); expect(guard.active).toBe(false);
    guard.step(1 / 12); expect(guard.active).toBe(true); expect(guard.pose).toBe('guard-up-02');
    guard.step(2 / 12); expect(guard.pose).toBe('guard-hold-00'); guard.step(4 / 12);
    expect(guard.pose).toBe('guard-hold-01');
  });
  it('keeps quick release as a sweep, consumes an engaged release and cancels interrupted taps', () => {
    const guard = new Guard(); guard.press(1); guard.step(0.005); expect(guard.release()).toBe(true);
    guard.press(1); guard.step(2 / 12); expect(guard.release()).toBe(false);
    guard.press(1); guard.cancel(); expect(guard.release()).toBe(false);
  });
  it('blocks a normal front charge without health loss, and deflects the rover without damaging it', () => {
    const guard = new Guard(), life = new Life({ x: 100, y: 500 }); guard.press(1); guard.step(2 / 12);
    const rover = new Rover({ x: 120, y: 500 }, [100, 200]);
    const hit = guard.receive(1, rover.x, 100);
    expect(hit).toEqual({ blocked: true, fresh: true });
    if (hit.blocked) rover.deflect(1); else life.hit(1);
    expect(life.health).toBe(5); expect(rover.health).toBe(3); expect(rover.phase).toBe('hit');
    expect(guard.pose).toBe('guard-impact-00'); expect(guard.receive(1, 120, 100).fresh).toBe(false);
    rover.step(3 / 12); expect(rover.x).toBeCloseTo(120 + ROVER_WIDTH / 2); // knocked back half its width
    guard.step(4 / 12); expect(guard.phase).toBe('hold'); expect(guard.blocks).toBe(1);
  });
  it('blocks only in the facing direction and takes normal rear damage', () => {
    for (const facing of [-1, 1] as const) {
      const guard = new Guard(), life = new Life({ x: 100, y: 500 }); guard.press(facing); guard.step(2 / 12);
      expect(guard.receive(1, 100 + facing * 20, 100).blocked).toBe(true);
      const behind = guard.receive(1, 100 - facing * 20, 100);
      expect(behind.blocked).toBe(false); life.hit(1); expect(life.health).toBe(4); expect(guard.phase).toBe('idle');
    }
  });
  it('breaks for Jenny two-cell damage and completes four break poses without a release sweep', () => {
    expect(clips['guard-impact'].frames).toBe(4); expect(clips['guard-break'].frames).toBe(4);
    const guard = new Guard(), life = new Life({ x: 100, y: 500 }); guard.press(1); guard.step(2 / 12);
    expect(guard.receive(2, 120, 100).blocked).toBe(false); life.hit(2); expect(life.health).toBe(3);
    expect(guard.pose).toBe('guard-break-00'); expect(guard.release()).toBe(false);
    guard.step(1 / 12); expect(guard.pose).toBe('guard-break-01');
    guard.step(3 / 12); expect(guard.phase).toBe('idle'); expect(guard.release()).toBe(false);
  });
  it('pushes exactly 14px over three frames and respects kinematic walls', () => {
    const push = new GuardPush(); push.start(-1); let dx = 0;
    for (let n = 0; n < 60; n++) dx += push.step(1 / 120);
    expect(dx).toBeCloseTo(-14); expect(push.remaining).toBe(0);
    const world: Geometry = { walk: [[[0, 500], [400, 500]]], slide: [], oneWay: [], climb: [], solid: [{ x: 122, y: 400, w: 20, h: 120 }],
      noGo: [], hazard: [], interact: [], glideLift: [], spawn: [], ledge: [] };
    const body: Body = { x: 100, y: 500, vx: 0, vy: 0, grounded: true }; push.start(1);
    for (let n = 0; n < 30; n++) { body.vx = push.step(1 / 120) * 120; stepBody(body, [world], 1 / 120); }
    expect(body.x).toBe(108); expect(body.y).toBe(500);
  });
});
