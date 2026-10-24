import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../fx/sound/Audio', () => ({ sound: { play: () => undefined } }));
vi.mock('../stage/atmosphere/pipeline', () => ({ ACTOR_RIM: { colour: 0, strength: 0 }, addRim: () => false }));
import { Life } from '../combat/life';
import { arenaFrom, blinking, BUMP_SECONDS, JENNY_BOX, JennyFight, jumpable, PART_SECONDS, SPEED } from './jenny';
import { ramKnock, THROW_UP } from './jennyBoss';

const CLIPS = {
  rev: { frames: 4, fps: 12, loop: true }, charge: { frames: 4, fps: 12, loop: false },
  crash: { frames: 4, fps: 12, loop: false }, stunned: { frames: 3, fps: 12, loop: true },
  reboot: { frames: 2, fps: 12, loop: false },
};
const arena = arenaFrom({ x: 5416, w: 30 }, { x: 5760, y: 565 }, [[[5410, 565], [6010, 565]]]);
const until = (fight: JennyFight, phase: string) => { for (let i = 0; i < 2000 && fight.phase !== phase; i++) fight.step(1 / 60); };

describe('Jenny reads (P8)', () => {
  it('can be jumped at every phase speed in the narrow arena', () => {
    for (const speed of SPEED) expect(jumpable(speed)).toBe(true);
    expect(jumpable(300)).toBe(false); // too slow to pass under one jump: the reason she is fast
  });

  it('her charge throws the hero the way she drives and up, never back through her', () => {
    for (const facing of [-1, 1] as const) {
      const knock = ramKnock(5600, facing);
      const life = new Life({ x: 5600, y: 565 });
      life.hit(2, 5600 >= knock.sourceX ? 1 : -1); // how Player.damage picks the knock direction
      const step = life.tick(0.1);
      expect(Math.sign(step.dx)).toBe(facing);
      expect(knock.vy).toBe(-THROW_UP);
      expect(life.invulnerable).toBeGreaterThan(0.5); // brief invulnerability after the throw
    }
  });

  it('brakes when her charge hits, so the impact reads', () => {
    const free = new JennyFight(arena, 5760, CLIPS), hit = new JennyFight(arena, 5760, CLIPS);
    for (const f of [free, hit]) { f.start(); until(f, 'charge'); }
    hit.bumped();
    free.step(BUMP_SECONDS); hit.step(BUMP_SECONDS);
    expect(Math.abs(hit.x - 5760)).toBeLessThan(Math.abs(free.x - 5760) * 0.5);
  });

  it('tells before the charge: the rev shakes her, and only the rev', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    const shakes = new Set<number>();
    for (let i = 0; i < 50; i++) { fight.step(1 / 60); shakes.add(fight.shake); }
    expect(fight.phase).toBe('rev');
    expect([...shakes].some(s => s !== 0)).toBe(true);
    until(fight, 'charge');
    expect(fight.shake).toBe(0);
  });

  it('opens her back: hits land at the tail while she drives, anywhere while stunned', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    expect(fight.open).toBe('back');
    expect(fight.tailX).toBe(5760 + JENNY_BOX.w / 2); // nose left, tail right
    until(fight, 'stunned');
    expect(fight.open).toBe('all');
  });

  it('sheds parts that bounce, then lie as hazards for a while and blink before they go', () => {
    const fight = new JennyFight(arena, 5760, CLIPS);
    fight.start();
    until(fight, 'crash');
    const part = fight.parts[0];
    let bounced = false;
    for (let i = 0; i < 120 && part.landed === 0; i++) { fight.step(1 / 120); if (part.vy < 0 && part.bounces > 0) bounced = true; }
    expect(bounced).toBe(true);
    for (let t = 0; t < PART_SECONDS - 0.8; t += 1 / 60) fight.step(1 / 60);
    expect(fight.parts).toContain(part);
    expect(blinking(part)).toBe(false);
    for (let t = 0; t < 0.5; t += 1 / 60) fight.step(1 / 60);
    expect(blinking(part)).toBe(true);
    for (let t = 0; t < 1; t += 1 / 60) fight.step(1 / 60);
    expect(fight.parts).not.toContain(part);
  });
});
