import { describe, expect, it } from 'vitest';
import { Overhead, SLAM_SPEED } from './overhead';
import { Rover } from '../enemies/rover';
import { pogo, jump } from '../player/jump';
import { stepBody, type Body } from '../player/body';
import type { Damageable } from './sweeps';
import raw from '../../../art/stages/rusty-creek/rc-1-0.anomaly.collision.json';
import clips from '../../public/assets/sprites/chair-overhead.anims.json';

describe('measured overhead chair attacks', () => {
  it('enables only up poses 02/03, with exact measured bounds and six-pose duration', () => {
    expect(clips.up).toEqual({ frames: 6, fps: 12, loop: false });
    expect(clips.slam.frames).toBe(7); expect(clips.pogo.frames).toBe(4);
    const attack = new Overhead(), feet = { x: 100, y: 500 };
    attack.begin('up', 1); attack.step(1 / 12); expect(attack.box(feet, 500)).toBeUndefined();
    attack.step(1 / 12); expect(attack.box(feet, 500)).toEqual({ x: 96, y: 319, w: 68, h: 93 });
    attack.step(1 / 12); expect(attack.box(feet, 500)).toBeDefined();
    attack.step(1 / 12); expect(attack.box(feet, 500)).toBeUndefined();
    attack.step(2 / 12); expect(attack.pose).toBeUndefined();
    attack.begin('up', -1); attack.step(2 / 12);
    expect(attack.box(feet, 500)).toEqual({ x: 36, y: 319, w: 68, h: 93 });
  });
  it('reaches the Rusty Creek drone at its hover height from the ground and from the deck under it', () => {
    const drone = raw.spawn.find(spawn => spawn.kind === 'drone')!;
    for (const floor of [536, 570]) {
      const attack = new Overhead(); let hits = 0;
      const target: Damageable = { id: drone.id, bounds: () => ({ x: drone.x - 22.5, y: drone.y - 45, w: 45, h: 45 }),
        hit: () => { hits++; return true; } };
      attack.begin('up', 1); attack.step(2 / 12);
      attack.contact({ x: drone.x - 20, y: floor }, floor, [target]); expect(hits).toBe(1);
    }
  });
  it('hits a 40px crab fixture at its authored one-way deck from below only once', () => {
    const crab = raw.spawn.find(spawn => spawn.kind === 'crab')!;
    expect(raw.oneWay.some(line => line.some(point => point[1] === crab.y))).toBe(true);
    let hits = 0;
    const target: Damageable = { id: crab.id, bounds: () => ({ x: crab.x - 20, y: crab.y - 40, w: 40, h: 40 }),
      hit: hit => { expect(hit.kind).toBe('up'); hits++; return true; } };
    const attack = new Overhead(), feet = { x: crab.x, y: crab.y + 80 };
    attack.begin('up', 1); attack.step(2 / 12);
    expect(attack.contact(feet, feet.y, [target]).hits).toHaveLength(1);
    expect(attack.contact(feet, feet.y, [target]).hits).toHaveLength(0); expect(hits).toBe(1);
  });
  it('performs three fresh pogos on the rover, bouncing before body contact', () => {
    const attack = new Overhead(), rover = new Rover({ x: 760, y: 508 }, [640, 880]);
    const target: Damageable = { id: 'rover', active: () => rover.health > 0, bounds: () => rover.bounds,
      hit: hit => { expect(hit.kind).toBe('slam'); return rover.hit(hit.damage, hit.direction); } };
    for (let n = 0; n < 3; n++) {
      expect(attack.begin('slam', 1)).toBe(true); attack.step(3 / 12);
      const top = rover.bounds.y, feet = { x: rover.x - 20, y: top + 5 };
      const contact = attack.contact(feet, top - 10, [target]);
      expect(contact.hits).toHaveLength(1); expect(contact.bounce).toBe(top);
      expect(attack.phase).toBe('pogo'); expect(rover.health).toBe(2 - n);
      expect(attack.contact(feet, top - 10, [target]).bounce).toBeUndefined();
      attack.step(4 / 12); rover.step(3 / 12);
    }
  });
  it('sweeps thin hazards without tunnelling and never bounces while rising or on wrecks', () => {
    const attack = new Overhead(), hazard = { x: 120, y: 500, w: 20, h: 2 };
    attack.begin('slam', 1); attack.step(3 / 12);
    expect(SLAM_SPEED).toBeCloseTo(2 * 4.6 * 43); // docs/02: twice run speed
    expect(attack.hazard({ x: 100, y: 440 }, 450, [hazard])).toBeUndefined();
    expect(attack.hazard({ x: 100, y: 520 }, 450, [hazard])).toBe(500);
    expect(attack.hazard({ x: 100, y: 520 }, 450, [hazard])).toBeUndefined();
    attack.step(4 / 12); attack.begin('slam', 1); attack.step(3 / 12);
    const wreck: Damageable = { id: 'wreck', active: () => false, bounds: () => hazard, hit: () => true };
    expect(attack.contact({ x: 100, y: 520 }, 450, [wreck]).bounce).toBeUndefined();
    const armour = { ...wreck, active: () => true, hit: () => false };
    expect(attack.contact({ x: 100, y: 520 }, 450, [armour]).bounce).toBe(500);
  });
  it('buffers one directional press during pogo recovery and clears it on cancellation', () => {
    const attack = new Overhead(), hazard = { x: 120, y: 500, w: 20, h: 2 };
    attack.begin('slam', 1); attack.step(3 / 12); attack.hazard({ x: 100, y: 510 }, 490, [hazard]);
    expect(attack.begin('slam', -1)).toBe(true); expect(attack.phase).toBe('pogo');
    attack.step(3 / 12); expect(attack.phase).toBe('pogo');
    attack.step(1 / 12); expect(attack.phase).toBe('windup'); expect(attack.direction).toBe(-1);
    attack.cancel(); attack.step(1); expect(attack.phase).toBe('idle');
    attack.begin('slam', 1); attack.step(3 / 12); attack.begin('slam', 1);
    attack.hazard({ x: 100, y: 510 }, 490, [hazard]); attack.cancel(); attack.step(1);
    expect(attack.phase).toBe('idle');
    attack.begin('slam', 1); attack.step(3 / 12); attack.begin('slam', 1);
    attack.land(true); attack.step(3 / 12); expect(attack.phase).toBe('idle');
  });
  it('uses a full 96px bounce even without Jump held, then plays plain-floor recovery without shockwaves', () => {
    const body: Body = { x: 100, y: 500, vx: 0, vy: 516, grounded: false };
    const air = pogo(body, 483); let peak = body.y;
    expect(body.y).toBe(483); expect(body.vy).toBe(-485);
    for (let n = 0; n < 120; n++) { jump(body, air, false, 1 / 120); stepBody(body, [], 1 / 120); peak = Math.min(peak, body.y); }
    expect(483 - peak).toBeGreaterThan(95); expect(483 - peak).toBeLessThan(97);
    const attack = new Overhead(); attack.begin('slam', 1); attack.step(3 / 12); attack.land(true);
    expect(attack.pose).toBe('slam-04'); attack.step(3 / 12); expect(attack.phase).toBe('idle');
  });
});
