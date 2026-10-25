import { describe, expect, it } from 'vitest';
import { HERO_OUTLINE, heroRim, PREFERENCES_KEY, PreferenceStore } from './preferences';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

describe('preferences', () => {
  it('start with the art\'s own warm rim and save the brighter outline', () => {
    const store = memory();
    const prefs = new PreferenceStore(store);
    expect(prefs.state.heroOutline).toBe(false);
    const seen: boolean[] = [];
    prefs.on(p => seen.push(p.heroOutline));
    prefs.set({ heroOutline: true });
    expect(seen).toEqual([true]);
    expect(new PreferenceStore(store).state.heroOutline).toBe(true);
    expect(JSON.parse(store.data[PREFERENCES_KEY])).toEqual({ heroOutline: true });
  });
  it('ignore broken data', () => {
    expect(new PreferenceStore(memory({ [PREFERENCES_KEY]: '{oops' })).state.heroOutline).toBe(false);
  });
  it('pick the hero rim', () => {
    const actor = { colour: 0xffc878, strength: 0.45 };
    expect(heroRim({ heroOutline: false }, actor)).toBe(actor);
    expect(heroRim({ heroOutline: true }, actor)).toBe(HERO_OUTLINE);
  });
});
