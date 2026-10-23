import { describe, expect, it } from 'vitest';
import { DEXTER_AFTER_JENNY_PX, dexterScale, EndingSequence, TIMING } from './endingSequence';

describe('the ending', () => {
  it('runs leak, appear, absorb, grow, leave and glitch, then waits on the window', () => {
    const run = new EndingSequence();
    run.start();
    const seen = [run.phase];
    for (const phase of ['leak', 'appear', 'absorb', 'grow', 'leave', 'glitch'] as const) seen.push(run.update(TIMING[phase]));
    expect(seen).toEqual(['leak', 'appear', 'absorb', 'grow', 'leave', 'glitch', 'dialog']);
    expect(run.update(60_000)).toBe('dialog');
  });

  it('needs OK on the window, then a confirm after the credits, and finishes once', () => {
    let done = 0;
    const run = new EndingSequence(() => done++);
    run.start();
    for (const phase of ['leak', 'appear', 'absorb', 'grow', 'leave', 'glitch'] as const) run.update(TIMING[phase]);
    expect(run.confirm()).toBe(false);
    run.update(TIMING.dialogGuard);
    expect(run.confirm()).toBe(true);
    expect(run.phase).toBe('credits');
    expect(run.confirm()).toBe(false);
    run.update(TIMING.creditsGuard);
    expect(run.confirm()).toBe(true);
    expect(run.confirm()).toBe(false);
    expect(done).toBe(1);
  });

  it('starts only once', () => {
    const run = new EndingSequence();
    run.start();
    run.update(TIMING.leak);
    run.start();
    expect(run.phase).toBe('appear');
  });

  it('grows Dexter from the 27 px plush to 46 px, as docs/04 says', () => {
    expect(DEXTER_AFTER_JENNY_PX).toBe(46);
    expect(dexterScale('absorb', 1) * 27).toBe(27);
    expect(dexterScale('grow', 0) * 27).toBe(27);
    expect(dexterScale('grow', 1) * 27).toBeCloseTo(46);
    expect(dexterScale('leave', 0) * 27).toBeCloseTo(46);
  });
});
