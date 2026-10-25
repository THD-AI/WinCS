import { describe, expect, it } from 'vitest';
import { holdStage } from './swap';

/** A scene manager reduced to one scene's status, acting at once like Phaser's outside its update. */
function manager(status: 'running' | 'paused' | 'stopped') {
  const calls: string[] = [];
  const scenes = {
    get status() { return status; },
    isActive: () => status === 'running',
    isPaused: () => status === 'paused',
    pause: () => { calls.push('pause'); status = 'paused'; return scenes as never; },
    resume: () => { calls.push('resume'); status = 'running'; return scenes as never; },
    stop: () => { status = 'stopped'; },
  };
  return { scenes, calls };
}

describe('holdStage', () => {
  it('pauses a running stage and resumes it at once', () => {
    const { scenes, calls } = manager('running');
    holdStage(scenes, true);
    expect(scenes.status).toBe('paused');
    holdStage(scenes, false);
    expect(scenes.status).toBe('running');
    expect(calls).toEqual(['pause', 'resume']);
  });
  it('never revives a stage a region swap stopped (menu Level buttons)', () => {
    const { scenes, calls } = manager('paused');
    scenes.stop();                      // swapRegion: the stage shuts down
    holdStage(scenes, false);           // the menu closes afterwards
    expect(scenes.status).toBe('stopped');
    expect(calls).toEqual([]);
  });
});
