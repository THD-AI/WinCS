import { describe, expect, it } from 'vitest';
import { catalogue, LocomotionAnimation, type MotionPose } from './animation';
import type { AnimationTable } from '../stage/assets';
// Test files live in src/player, two levels below the game root.
const realTables = import.meta.glob<AnimationTable>('../../public/assets/sprites/hero*.anims.json', { eager: true, import: 'default' });
const clips = catalogue(Object.fromEntries(Object.entries(realTables).map(([path, table]) => [path.split('/').at(-1)!.replace('.anims.json', ''), table])));
const tick = (machine: LocomotionAnimation, pose: MotionPose, frames: number) => {
  for (let i = 0; i < frames; i++) machine.update(pose, 1 / 12);
};
describe('stepped locomotion animation', () => {
  it('plays the walk and run cycles by distance, so the planted foot never slides', () => {
    expect(clips.walk.stride).toBe(43); expect(clips.run.stride).toBe(82);
    const machine = new LocomotionAnimation(clips);
    tick(machine, 'walk', 4); expect(machine.clip).toBe('walk');
    const start = machine.frame;
    // 43 px per 8-frame cycle: 5.375 px per frame. Travel 4 frames' worth at any speed and the cycle moves 4 frames.
    for (const speed of [40, 94.6]) {
      const from = machine.frame;
      for (let t = 0; t < 4 * 5.375 / speed - 1e-6; t += 1 / 240) machine.update('walk', 1 / 240, speed);
      expect((machine.frame - from + 8) % 8).toBe(4);
    }
    expect(machine.frame).toBe(start);
  });
  it('uses the actual movement animation tables', () => {
    expect(clips.walk.frames).toBe(8); expect(clips.run.frames).toBe(8);
    expect(clips.land.start).toBe(7); expect(clips.land.frames).toBe(2); // the jump row's own crouch and stand
  });
  it('plays idle-to-walk and only changes a walk cycle at a contact pose', () => {
    const machine = new LocomotionAnimation(clips);
    expect(machine.update('walk', 0).frame).toBe('idle-walk-00');
    tick(machine, 'walk', 4); expect(machine.clip).toBe('walk'); expect(machine.frame).toBe(2);
    machine.update('run', 0); expect(machine.clip).toBe('walk');
    tick(machine, 'run', 2); expect(machine.clip).toBe('walk-run'); expect(machine.frame).toBe(0);
    tick(machine, 'run', 2); expect(machine.clip).toBe('run'); expect(machine.frame).toBe(0);
    tick(machine, 'run', 2); machine.update('idle', 0); expect(machine.clip).toBe('run');
    tick(machine, 'idle', 2); expect(machine.clip).toBe('walk-run'); expect(machine.reverse).toBe(true);
    tick(machine, 'idle', 4); expect(machine.clip).toBe('idle');
  });
  it('steps at 12fps, holds anticipation and never scales or blends a frame', () => {
    const machine = new LocomotionAnimation(clips);
    expect(machine.update('jump', 1 / 12).frame).toBe('jump-00');
    expect(machine.update('jump', 1 / 12).frame).toBe('jump-01');
    expect(machine.update('jump', 1 / 120).frame).toBe('jump-01');
    expect(machine.update('fall', 0).frame).toBe('fall-00');
    expect(machine.update('land', 0)).toEqual({ board: 'hero-air', frame: 'jump-07' });
    expect(machine.update('land', 1 / 12)).toEqual({ board: 'hero-air', frame: 'jump-08' });
  });
  it('starts an idle variant where the idle loops, after 5–9 s, and interrupts it for movement', () => {
    const machine = new LocomotionAnimation(clips, () => 0);
    tick(machine, 'idle', 59); expect(machine.clip).toBe('idle');
    tick(machine, 'idle', 2); expect(machine.clip).toBe('look-around');
    expect(machine.update('walk', 0).frame).toBe('idle-walk-00');
    const later = new LocomotionAnimation(clips, () => 0.5); // 5 + 0.5 × 4 = 7 s
    tick(later, 'idle', 80); expect(later.clip).toBe('idle');
    tick(later, 'idle', 6); expect(later.clip).toBe('check-tablet');
  });
  it('holds each variant on its key pose, never repeats one, and checks the wounds when hurt', () => {
    const machine = new LocomotionAnimation(clips, () => 0);
    tick(machine, 'idle', 61); expect(machine.clip).toBe('look-around');
    const frames: string[] = [];
    for (let i = 0; i < 48; i++) frames.push(machine.update('idle', 1 / 24).frame);
    expect(frames.filter(f => f === 'look-around-02').length).toBeGreaterThanOrEqual(20); // 0.9 s held
    expect(machine.clip).toBe('idle');
    tick(machine, 'idle', 61); expect(machine.clip).toBe('check-tablet'); // not look-around again
    const hurt = new LocomotionAnimation(clips, () => 0); hurt.wounded = true;
    tick(hurt, 'idle', 61); expect(hurt.clip).toBe('check-wounds');
    // check-wounds ends with the hand out: it plays back to its first frame before the idle resumes.
    const out: string[] = [];
    for (let i = 0; i < 60 && hurt.clip === 'check-wounds'; i++) out.push(hurt.update('idle', 1 / 24).frame);
    expect(out.at(-2)).toBe('check-wounds-00'); expect(out.at(-1)).toBe('idle-00');
  });
  it('breathes: the chest is up for two idle loops and down for two, changing only at the loop', () => {
    const machine = new LocomotionAnimation(clips, () => 0.99);
    const breath: number[] = [];
    for (let i = 0; i < 48; i++) { machine.update('idle', 1 / 12); breath.push(machine.breath); }
    expect(breath.slice(0, 11).every(b => b === 0)).toBe(true);
    expect(breath.slice(12, 23).every(b => b === 1)).toBe(true);
    expect(breath.slice(24, 35).every(b => b === 0)).toBe(true);
    breath.forEach((b, i) => { if (i && b !== breath[i - 1]) expect(machine.frame === 0 || i % 6 === 0).toBe(true); });
    machine.update('walk', 0); expect(machine.breath).toBe(0);
  });
  it('keeps the stride through a step between deck plates instead of flashing the fall pose', () => {
    const machine = new LocomotionAnimation(clips);
    tick(machine, 'run', 8); expect(machine.clip).toBe('run');
    const air = { vy: 60, launch: 485 };
    for (let i = 0; i < 6; i++) expect(machine.update('fall', 1 / 60, 198, air).frame).toMatch(/^run-/);
    machine.update('run', 1 / 60, 198); expect(machine.clip).toBe('run');
  });
  it('lands a moving hero straight into the cycle it is in, never through idle and run-start', () => {
    const machine = new LocomotionAnimation(clips);
    const air = (vy: number) => ({ vy, launch: 485 });
    machine.update('run', 0, 198);
    for (let vy = -485; vy < 300; vy += 20) machine.update(vy < 0 ? 'jump' : 'fall', 1 / 60, 198, air(vy));
    expect(machine.update('land', 1 / 60, 198).frame).toBe('jump-07');
    const clipsSeen = new Set<string>();
    for (let i = 0; i < 20; i++) { machine.update('run', 1 / 60, 198); clipsSeen.add(machine.clip); }
    expect([...clipsSeen]).toEqual(['run']);
    expect(machine.frame).toBeGreaterThan(0); // the cycle is advancing
  });
  it('jumps out of a landing without a second crouch, and shows a fresh crouch for one rendered frame', () => {
    const air = (vy: number) => ({ vy, launch: 485 });
    const machine = new LocomotionAnimation(clips);
    expect(machine.update('jump', 1 / 60, 0, air(-485)).frame).toBe('jump-00');
    expect(machine.update('jump', 1 / 60, 0, air(-445)).frame).toBe('jump-01');
    for (let vy = -425; vy < 400; vy += 20) machine.update(vy < 0 ? 'jump' : 'fall', 1 / 60, 0, air(vy));
    machine.update('land', 1 / 60);
    expect(machine.update('jump', 1 / 60, 0, air(-485)).frame).toBe('jump-01');
  });
  it('lets air and ladder poses interrupt a bridge immediately', () => {
    const machine = new LocomotionAnimation(clips);
    machine.update('walk', 0);
    expect(machine.update('jump', 0).frame).toBe('jump-00');
    expect(machine.update('ladder', 0).frame).toBe('ladder-00');
  });
  it('uses the run-start clip when starting directly into a run', () => {
    const machine = new LocomotionAnimation(clips);
    expect(machine.update('run', 0).frame).toBe('run-start-00');
    tick(machine, 'run', 3); expect(machine.clip).toBe('run'); expect(machine.frame).toBe(0);
  });
  it('finishes fallback bridges even if only the placeholder idle clip exists', () => {
    const machine = new LocomotionAnimation(catalogue({ 'hero-move': { idle: { frames: 1, fps: 12, loop: true } } }));
    tick(machine, 'walk', 8); expect(machine.clip).toBe('walk');
    expect(machine.update('walk', 0).frame).toBe('idle-00');
  });
});
