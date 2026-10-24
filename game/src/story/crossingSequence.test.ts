import { describe, expect, it } from 'vitest';
import { CrossingSequence, tearLayout, TIMING, TIMING_404 } from './crossingSequence';

describe('the crossing', () => {
  it('runs hit, freeze and the dialog, then waits for OK', () => {
    const run = new CrossingSequence();
    expect(run.phase).toBe('idle');
    run.start();
    expect(run.update(TIMING.hit)).toBe('freeze');
    expect(run.update(TIMING.freeze)).toBe('dialog');
    expect(run.update(60_000)).toBe('dialog');
  });

  it('ignores OK before the dialog can be read, then cuts and lands once', () => {
    let landed = 0;
    const run = new CrossingSequence(() => landed++);
    expect(run.confirm()).toBe(false);
    run.start();
    run.update(TIMING.hit);
    run.update(TIMING.freeze);
    expect(run.confirm()).toBe(false);
    run.update(TIMING.dialogGuard);
    expect(run.confirm()).toBe(true);
    expect(run.phase).toBe('cut');
    expect(run.update(TIMING.cut)).toBe('done');
    run.update(1000);
    expect(landed).toBe(1);
  });
});

describe('the 404 crossing', () => {
  it('pulls the hero into the void after OK, then cuts and lands once', () => {
    let landed = 0;
    const run = new CrossingSequence(() => landed++, TIMING_404);
    run.start();
    run.update(TIMING_404.hit);
    expect(run.update(TIMING_404.freeze - 1)).toBe('freeze');
    expect(run.update(1)).toBe('dialog');
    run.update(TIMING_404.dialogGuard);
    expect(run.confirm()).toBe(true);
    expect(run.phase).toBe('pull');
    expect(run.confirm()).toBe(false);
    run.update(TIMING_404.pull / 2);
    expect(run.pullProgress()).toBeCloseTo(0.5);
    expect(run.update(TIMING_404.pull / 2)).toBe('cut');
    expect(landed).toBe(0);
    expect(run.update(TIMING_404.cut)).toBe('done');
    expect(landed).toBe(1);
  });

  it('tears the frame inside the view, the void just past the hero', () => {
    const view = { w: 1280, h: 720 };
    for (const hero of [{ x: 640, y: 500 }, { x: 10, y: 700 }, { x: 1275, y: 20 }]) {
      const tear = tearLayout(hero, view);
      for (const a of [tear.void, tear.stretch, ...tear.cuts.map(c => c.area)]) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(view.w);
        expect(a.y + a.h).toBeLessThanOrEqual(view.h);
      }
    }
    const mid = tearLayout({ x: 640, y: 500 }, view).void;
    expect(mid.x + mid.w / 2).toBeGreaterThan(640);
  });

  it('keeps the classic crossing without a pull', () => {
    const run = new CrossingSequence();
    run.start();
    run.update(TIMING.hit);
    run.update(TIMING.freeze);
    run.update(TIMING.dialogGuard);
    run.confirm();
    expect(run.phase).toBe('cut');
  });
});
