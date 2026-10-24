import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../fx/sound/Audio', () => ({ sound: { play: () => undefined } }));
vi.mock('../stage/atmosphere/pipeline', () => ({ ACTOR_RIM: { colour: 0, strength: 0 }, addRim: () => false }));
import { Crab, CRAB_SPOT, CRAB_STRIKE, CRAB_WIDTH, STAB_REACH } from './crab';
import { Rover, TURN_SECONDS } from './rover';
import { harmfulPhase } from './rovers';
import { BODY_WIDTH } from '../player/body';

const run = (model: { step(s: number, hero?: { x: number; y: number }): boolean }, seconds: number, hero?: { x: number; y: number }) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) model.step(1 / 60, hero);
};

describe('patrol ends (no flip-flop)', () => {
  it('a rover stops and idles at a patrol end before it turns back', () => {
    const rover = new Rover({ x: 860, y: 508 }, [640, 880]);
    run(rover, 0.5);
    expect(rover.x).toBe(880);
    expect(rover.direction).toBe(1); // still looking out, idling
    expect(rover.pose).toMatch(/^idle-/);
    run(rover, TURN_SECONDS);
    expect(rover.direction).toBe(-1);
    run(rover, 0.2);
    expect(rover.x).toBeLessThan(880);
    expect(rover.pose).toMatch(/^drive-/);
  });

  it('a crab does the same, and keeps facing a hero it cannot reach past its patrol end', () => {
    const crab = new Crab({ x: 1060, y: 135 }, [1050, 1330]);
    run(crab, 0.4);
    expect([crab.x, crab.direction]).toEqual([1050, -1]);
    expect(crab.pose).toMatch(/^idle-/);
    run(crab, TURN_SECONDS);
    expect(crab.direction).toBe(1);
    const stuck = new Crab({ x: 1060, y: 135 }, [1050, 1330]);
    const hero = { x: 1050 - CRAB_STRIKE - 20, y: 135 }; // spotted, off its patrol, out of reach
    const facings = new Set<number>();
    for (let t = 0; t < 2; t += 1 / 60) { stuck.step(1 / 60, hero); facings.add(stuck.direction); }
    expect([...facings]).toEqual([-1]);
    expect([stuck.x, stuck.phase]).toEqual([1050, 'walk']);
    expect(stuck.pose).toMatch(/^idle-/);
  });
});

describe('the crab creeps in before it stabs', () => {
  it('reaches the hero with its stab exactly from its strike distance', () => {
    expect(CRAB_STRIKE).toBeLessThan(CRAB_WIDTH / 2 + STAB_REACH + BODY_WIDTH / 2);
    expect(CRAB_STRIKE).toBeLessThan(CRAB_SPOT);
  });

  it('walks toward a spotted hero instead of stabbing air, then tells, stabs and recovers', () => {
    const crab = new Crab({ x: 1200, y: 135 }, [1050, 1330]);
    const hero = { x: 1200 + CRAB_SPOT - 5, y: 135 };
    crab.step(1 / 60, hero);
    expect(crab.phase).toBe('walk');
    expect(crab.direction).toBe(1);
    const phases: string[] = [];
    for (let t = 0; t < 6 && !phases.includes('recover'); t += 1 / 60) {
      crab.step(1 / 60, hero);
      if (phases.at(-1) !== crab.phase) phases.push(crab.phase);
      if (crab.phase === 'stab' && crab.attack) {
        const reach = crab.attack;
        expect(reach.x + reach.w).toBeGreaterThan(hero.x - BODY_WIDTH / 2); // the stab lands on the hero
      }
    }
    expect(phases).toEqual(['walk', 'tell', 'stab', 'recover']);
    expect(hero.x - crab.x).toBeLessThanOrEqual(CRAB_STRIKE);
  });
});

describe('contact damage', () => {
  it('a knocked-back or falling enemy never hurts; the drone only on its dive', () => {
    for (const kind of ['rover', 'crab', 'drone'] as const) {
      for (const phase of ['hit', 'wreck', 'collapse', 'crash', 'dead']) expect(harmfulPhase(kind, phase)).toBe(false);
    }
    expect(harmfulPhase('rover', 'charge')).toBe(true);
    expect(harmfulPhase('crab', 'walk')).toBe(true);
    expect(harmfulPhase('drone', 'hover')).toBe(false);
    expect(harmfulPhase('drone', 'dive')).toBe(true);
  });
});
