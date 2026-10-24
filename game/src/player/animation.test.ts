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
    expect(clips.land.start).toBe(8);
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
    expect(machine.update('land', 0)).toEqual({ board: 'hero-air', frame: 'jump-08' });
  });
  it('starts a random idle variant after five seconds and interrupts it for movement', () => {
    const machine = new LocomotionAnimation(clips, () => 0.5);
    tick(machine, 'idle', 59); expect(machine.clip).toBe('idle');
    tick(machine, 'idle', 2); expect(machine.clip).toBe('check-tablet');
    expect(machine.update('walk', 0).frame).toBe('idle-walk-00');
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
