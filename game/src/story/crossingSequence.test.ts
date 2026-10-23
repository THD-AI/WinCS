import { describe, expect, it } from 'vitest';
import { CrossingSequence, TIMING } from './crossingSequence';

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
