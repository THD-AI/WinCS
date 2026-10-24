import { describe, expect, it } from 'vitest';
import { Interaction } from './interaction';
import clips from '../../public/assets/sprites/hero-hurt.anims.json';
describe('authored drink clip', () => {
  it('owns input for exactly three poses at 12 fps, then releases it', () => {
    const action = new Interaction(); action.begin(clips.interact);
    expect(action.active).toBe(true);
    expect(action.step(1 / 12)?.frame).toBe('interact-00');
    expect(action.step(1 / 12)?.frame).toBe('interact-01');
    expect(action.active).toBe(true);
    expect(action.step(1 / 12)?.frame).toBe('interact-02');
    expect(action.active).toBe(false); expect(action.step(1 / 12)).toBeUndefined();
  });
  it('can be interrupted by damage without leaving input locked', () => {
    const action = new Interaction(); action.begin(clips.interact); action.step(0.05); action.cancel();
    expect(action.active).toBe(false); expect(action.step(0.01)).toBeUndefined();
    action.begin(clips.interact); expect(action.step(0.01)?.frame).toBe('interact-00');
  });
});
