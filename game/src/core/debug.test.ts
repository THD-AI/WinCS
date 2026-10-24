import { describe as suite, expect, it } from 'vitest';
import { DebugStore, describe } from './debug';

suite('debug mode switches', () => {
  it('shows nothing until debug mode is on', () => {
    const store = new DebugStore();
    expect(store.shows('collision')).toBe(false);
    store.toggleLayer('02-mid');
    expect(store.layerVisible('02-mid')).toBe(true); // a hidden layer only hides in debug mode
    store.set({ on: true });
    expect(store.shows('collision')).toBe(true);
    expect(store.layerVisible('02-mid')).toBe(false);
  });

  it('toggles a layer back and tells listeners', () => {
    const store = new DebugStore();
    const seen: number[] = [];
    store.on(state => seen.push(state.hidden.size));
    store.toggleLayer('00-sky');
    store.toggleLayer('00-sky');
    expect(seen).toEqual([1, 0]);
  });

  it('names every switch that is on, for screenshots', () => {
    const store = new DebugStore();
    expect(describe(store.state)).toBe('');
    store.set({ on: true, actors: false, backdrop: true, zoom: 0.5 });
    store.toggleLayer('01-far');
    expect(describe(store.state)).toBe('debug: backdrop collision stats | hidden: 01-far | zoom 0.5');
  });
});
