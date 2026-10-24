import { describe, expect, it } from 'vitest';
import { HitStop, Sweeps, type Damageable } from './sweeps';
import clips from '../../public/assets/sprites/chair-side.anims.json';
describe('light chair sweeps', () => {
  it('alternates eight-frame sweeps and completes two recoil frames, with a one-tap buffer', () => {
    expect(clips['sweep-a'].frames).toBe(8); expect(clips['sweep-b'].frames).toBe(8); expect(clips.recoil.frames).toBe(2);
    const sweep = new Sweeps(); sweep.press(1); expect(sweep.phase).toBe('sweep-a');
    sweep.press(1); sweep.step(8 / 12); expect(sweep.phase).toBe('recoil'); expect(sweep.frame).toBe(0);
    sweep.step(1 / 12); expect(sweep.phase).toBe('recoil'); expect(sweep.frame).toBe(1);
    sweep.step(1 / 12); expect(sweep.phase).toBe('sweep-b'); expect(sweep.frame).toBe(0);
  });
  it('enables hitboxes only on A04 and B03, with a single hit per target per swing', () => {
    const sweep = new Sweeps(), position = { x: 100, y: 500 }; let hits = 0;
    const target: Damageable = { id: 'dummy', bounds: () => ({ x: 128, y: 475, w: 25, h: 25 }), hit: () => { hits++; return true; } };
    sweep.press(1); sweep.step(3 / 12); expect(sweep.box(position)).toBeNull();
    sweep.step(1 / 12); expect(sweep.hit(position, [target])).toHaveLength(1);
    expect(sweep.hit(position, [target])).toHaveLength(0); expect(hits).toBe(1);
    sweep.step(1 / 12); expect(sweep.box(position)).toBeNull();
    sweep.step(5 / 12); sweep.press(1); sweep.step(3 / 12);
    expect(sweep.hit(position, [target])).toHaveLength(1); expect(hits).toBe(2);
  });
  it('hits in the facing direction on both sides and never retries a rejected strike', () => {
    for (const direction of [-1, 1] as const) {
      const sweep = new Sweeps(); let attempts = 0;
      const target: Damageable = { id: 'guarded', bounds: () => ({ x: direction > 0 ? 130 : 50, y: 475, w: 25, h: 25 }),
        hit: hit => { attempts++; expect(hit.direction).toBe(direction); return false; } };
      sweep.press(direction); sweep.step(4 / 12);
      expect(sweep.hit({ x: 100, y: 500 }, [target])).toHaveLength(0);
      sweep.hit({ x: 100, y: 500 }, [target]); expect(attempts).toBe(1);
    }
  });
  it('cancels pending attacks on damage, death or climbing', () => {
    const sweep = new Sweeps(); sweep.press(1); sweep.press(-1); sweep.cancel(); sweep.step(2);
    expect(sweep.phase).toBe('idle'); expect(sweep.box({ x: 0, y: 0 })).toBeNull();
  });
  it('matches the measured 12–50 px reach on the 1.5x frames, from the floor to 87 px up, on both sides', () => {
    const right = new Sweeps(), left = new Sweeps(), position = { x: 100, y: 500 };
    right.press(1); left.press(-1); right.step(4 / 12); left.step(4 / 12);
    expect(right.box(position)).toEqual({ x: 112, y: 413, w: 38, h: 87 });
    expect(left.box(position)).toEqual({ x: 50, y: 413, w: 38, h: 87 });
    const beyond: Damageable = { id: 'beyond', bounds: () => ({ x: 151, y: 475, w: 25, h: 25 }),
      hit: () => { throw new Error('A short chair cannot hit beyond the approved pose'); } };
    expect(right.hit(position, [beyond])).toHaveLength(0);
  });
  it('reaches down to the floor: a 25 px rover and a flat crab right ahead are both hit', () => {
    const sweep = new Sweeps(), position = { x: 100, y: 500 }; let hits = 0;
    const low = (id: string, h: number): Damageable => ({ id, bounds: () => ({ x: 140, y: 500 - h, w: 30, h }), hit: () => { hits++; return true; } });
    sweep.press(1); sweep.step(4 / 12);
    expect(sweep.hit(position, [low('rover', 25), low('crab', 12)])).toHaveLength(2); expect(hits).toBe(2);
  });
  it('consumes exactly 60ms of hit-stop, including a partial rendered frame', () => {
    const stop = new HitStop(); stop.trigger(); let active = 0;
    for (let i = 0; i < 6; i++) active += stop.consume(1000 / 60);
    expect(active).toBeCloseTo(40, 7); expect(stop.remaining).toBe(0);
  });
});
