import { describe, expect, it } from 'vitest';
import crabClips from '../../public/assets/sprites/enemy-crab.anims.json';
import droneClips from '../../public/assets/sprites/enemy-drone.anims.json';
import { Crab, CRAB_HEALTH, CRAB_TELL } from './crab';
import { Drone, DRONE_HEALTH } from './drone';

const frames = (clips: Record<string, { frames: number }>) =>
  new Set(Object.entries(clips).flatMap(([name, c]) => Array.from({ length: c.frames }, (_, i) => `${name}-${String(i).padStart(2, '0')}`)));

describe('crab (P7)', () => {
  it('raises its legs for the tell, then stabs forward with a reach, only from the approved frames', () => {
    const crab = new Crab({ x: 1200, y: 135 }, [1050, 1330]);
    const names = frames(crabClips);
    const hero = { x: 1260, y: 135 };
    crab.step(1 / 60, hero);
    expect(crab.phase).toBe('tell');
    expect(crab.direction).toBe(1);
    expect(crab.attack).toBeUndefined();
    crab.step(CRAB_TELL, hero);
    expect(crab.phase).toBe('stab');
    crab.step(2.5 / 12, hero);
    expect(crab.attack!.x).toBeGreaterThanOrEqual(crab.bounds.x + crab.bounds.w);
    for (let t = 0; t < 3; t += 1 / 30) { crab.step(1 / 30, hero); expect(names.has(crab.pose)).toBe(true); }
  });

  it('takes four hits and collapses once', () => {
    const crab = new Crab({ x: 1200, y: 135 }, [1050, 1330]);
    let defeated = 0;
    for (let i = 0; i < CRAB_HEALTH; i++) { crab.hit(1, 1); for (let t = 0; t < 1; t += 1 / 60) defeated += crab.step(1 / 60) ? 1 : 0; }
    expect([crab.phase, defeated]).toEqual(['dead', 1]);
  });
});

describe('drone (P7)', () => {
  it('hovers out of reach, tilts when you pass under, dives, and climbs back', () => {
    const drone = new Drone({ x: 1150, y: 470 }, [900, 1500]);
    const names = frames(droneClips);
    const hero = { x: 1150, y: 570 };
    drone.step(1 / 60, hero);
    expect(drone.phase).toBe('tell');
    expect(drone.dangerous).toBe(false);
    let lowest = drone.y, dangerous = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      drone.step(1 / 60, { x: 0, y: 0 });
      lowest = Math.max(lowest, drone.y); dangerous ||= drone.dangerous;
      expect(names.has(drone.pose)).toBe(true);
    }
    expect(dangerous).toBe(true);
    expect(lowest).toBeGreaterThan(520);
    expect([drone.phase, drone.y]).toEqual(['hover', 470]);
  });

  it('takes eight hits', () => {
    const drone = new Drone({ x: 1150, y: 470 }, [900, 1500]);
    for (let i = 0; i < DRONE_HEALTH; i++) { drone.hit(1, 1); for (let t = 0; t < 0.5; t += 1 / 60) drone.step(1 / 60); }
    expect(drone.health).toBe(0);
  });
});
