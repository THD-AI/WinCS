import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../ui/Hud', () => ({ drawControlGlyph: () => undefined }));
vi.mock('../fx/sound/Audio', () => ({ sound: { play: () => undefined } }));
import clips from '../../public/assets/sprites/hero-hurt.anims.json';
import { Interaction } from '../player/interaction';
import { PickupMoment, SHOW_SECONDS } from './chairPickup';

describe('the chair pick-up moment (P7)', () => {
  const clip = clips['pick-up'];
  const seconds = clip.frames / clip.fps;

  it('plays the four pick-up poses, not the drink clip', () => {
    const action = new Interaction(); action.begin(clip, 'pick-up');
    const frames = [0, 1, 2, 3].map(() => action.step(1 / 12)?.frame);
    expect(frames).toEqual(['pick-up-00', 'pick-up-01', 'pick-up-02', 'pick-up-03']);
    expect(action.active).toBe(false);
  });

  it('picks, shows the chair, then hints until the first swing – and never before', () => {
    const moment = new PickupMoment(seconds);
    expect(moment.step(1, true)).toBe('waiting');
    moment.begin();
    expect(moment.step(seconds / 2, true)).toBe('picking'); // a swing during the clip does not skip the hint
    expect(moment.step(seconds / 2, false)).toBe('showing');
    expect(moment.step(SHOW_SECONDS, false)).toBe('hinting');
    expect(moment.step(5, false)).toBe('hinting'); // the glyph waits as long as it takes
    expect(moment.step(0.016, true)).toBe('done');
  });
});
