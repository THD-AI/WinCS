import { describe, expect, it } from 'vitest';
import { arenaFrom, JENNY_BOX, JENNY_HEALTH, JennyFight, REV_SECONDS } from './jenny';

// boss-jenny*.anims.json as exported (approved 24 Oct).
const CLIPS = {
  rev: { frames: 4, fps: 12, loop: true }, charge: { frames: 4, fps: 12, loop: false },
  crash: { frames: 4, fps: 12, loop: false }, stunned: { frames: 3, fps: 12, loop: true },
  reboot: { frames: 2, fps: 12, loop: false },
};
// Rusty Creek rc-2-0 anomaly in world px: gate at 4320 + 1096, floor y 565 from 5410 to 6010, Jenny at 5760.
const arena = arenaFrom({ x: 5416, w: 30 }, { x: 5760, y: 565 },
  [[[5410, 565], [6010, 565]], [[6012, 548], [6080, 548]]]);
const run = (fight: JennyFight, seconds: number) => {
  const seen: string[] = [];
  let beaten = false;
  for (let t = 0; t < seconds; t += 1 / 60) {
    beaten = fight.step(1 / 60) || beaten;
    if (seen.at(-1) !== fight.phase) seen.push(fight.phase);
  }
  return { seen, beaten };
};

describe('Jenny', () => {
  it('reads her arena from the gate and the floor under her spawn', () => {
    expect(arena).toEqual({ left: 5446, right: 6010, floor: 565 });
  });

  it('waits behind the gate, then revs, charges, crashes, is stunned and reboots', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    expect(run(fight, 2).seen).toEqual(['waiting']);
    fight.start();
    const { seen } = run(fight, REV_SECONDS + 5);
    expect(seen.slice(0, 5)).toEqual(['rev', 'charge', 'crash', 'stunned', 'reboot']);
    expect(fight.x).toBeGreaterThanOrEqual(arena.left + JENNY_BOX.w / 2);
  });

  it('crashes at the far wall and sheds three parts in phase 1', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    while (fight.phase !== 'crash') fight.step(1 / 60);
    expect(fight.x).toBe(arena.left + JENNY_BOX.w / 2);
    expect(fight.parts).toHaveLength(3);
    expect(fight.parts.every(p => p.vx > 0)).toBe(true); // thrown back out of the wall she hit
  });

  it('shrugs off hits on the armoured nose and takes them from behind or stunned', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    expect(fight.hit(1, 1)).toBe(false); // she faces left: a hit travelling right meets the nose
    expect(fight.hit(1, -1)).toBe(true);  // from behind
    while (fight.phase !== 'stunned') fight.step(1 / 60);
    expect(fight.hit(1, 1)).toBe(true);
    expect(fight.health).toBe(JENNY_HEALTH - 2);
  });

  it('charges twice in phase 2 and stun is shorter in phase 3', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    while (fight.phase !== 'stunned') fight.step(1 / 60);
    for (let i = 0; i < 10; i++) fight.hit(1, 1);
    expect(fight.stage).toBe(1);
    while ((fight.phase as string) !== 'charge') fight.step(1 / 60);
    const start = fight.facing;
    while (fight.facing === start) fight.step(1 / 60); // turned at the wall instead of crashing
    expect(fight.phase).toBe('charge');
  });

  it('stalls at 0, fires once, and stays beaten through a reset', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    while (fight.phase !== 'stunned') fight.step(1 / 60);
    for (let i = 0; i < JENNY_HEALTH; i++) fight.hit(1, 1);
    expect(fight.phase).toBe('stall');
    expect(run(fight, 3)).toEqual({ seen: ['stall', 'gone'], beaten: true });
    fight.reset();
    expect(fight.phase).toBe('gone');
  });

  it('resets to the start of the fight when the hero dies', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    run(fight, 2);
    fight.reset();
    expect([fight.phase, fight.health, fight.x, fight.parts.length]).toEqual(['waiting', JENNY_HEALTH, 5760, 0]);
  });
});
