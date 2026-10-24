import { describe, expect, it } from 'vitest';
import { WATCH, watchPhase } from './dexterWatch';

describe('Dexter watching from too far away (#160)', () => {
  it('watches while the hero is far, and leaves before he can be reached', () => {
    expect(watchPhase(1000, 1000 + WATCH.leaveAt + 50, undefined)).toBe('watch');
    expect(watchPhase(1000, 1000 + WATCH.leaveAt - 1, undefined)).toBe('leave');
  });

  it('is gone after his hop, wherever the hero is', () => {
    expect(watchPhase(0, 5000, WATCH.hopSeconds / 2)).toBe('leave');
    expect(watchPhase(0, 5000, WATCH.hopSeconds)).toBe('gone');
  });

  it('leaves before the ram trigger, so Jenny never meets him', () => {
    expect(WATCH.leaveAt).toBeGreaterThan(WATCH.beyond);
  });
});
