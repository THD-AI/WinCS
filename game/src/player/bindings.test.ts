import { describe, expect, it } from 'vitest';
import { BINDINGS_KEY, Bindings, DEFAULT_CODES, keyName } from './physicalKeys';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; } };
}

describe('rebindable keys', () => {
  it('starts with the defaults', () => {
    const b = new Bindings(memory());
    expect(b.codes('attack')).toEqual(DEFAULT_CODES.attack);
    expect(b.isDefault('jump')).toBe(true);
  });

  it('gives an action one key of the player\'s own, saved, and takes that key from the others', () => {
    const store = memory();
    const b = new Bindings(store);
    expect(b.set('attack', 'KeyK')).toBe(true);                          // K was a jump key
    expect(b.codes('attack')).toEqual(['KeyK']);
    expect(b.codes('jump')).toEqual(['Space', 'KeyZ']);
    expect(JSON.parse(store.data[BINDINGS_KEY])).toEqual({ attack: ['KeyK'] });
    expect(new Bindings(store).codes('attack')).toEqual(['KeyK']);       // back after a reload
    b.set('jump', 'KeyK');                                                // and it can be taken back
    expect(b.codes('attack')).toEqual([]);
    expect(b.codes('jump')).toEqual(['KeyK']);
  });

  it('keeps Esc, Tab and the debug keys for the game, and resets to the defaults', () => {
    const store = memory();
    const b = new Bindings(store);
    expect(b.set('dodge', 'Escape')).toBe(false);
    expect(b.set('dodge', 'Tab')).toBe(false);
    b.set('dodge', 'KeyQ');
    b.reset();
    expect(b.codes('dodge')).toEqual(DEFAULT_CODES.dodge);
    expect(store.data[BINDINGS_KEY]).toBeUndefined();
  });

  it('ignores broken saved data and blocked storage', () => {
    expect(new Bindings(memory({ [BINDINGS_KEY]: '{oops' })).codes('left')).toEqual(DEFAULT_CODES.left);
    expect(new Bindings(memory({ [BINDINGS_KEY]: '{"left": 5}' })).codes('left')).toEqual(DEFAULT_CODES.left);
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    const b = new Bindings(blocked);
    expect(b.set('left', 'KeyQ')).toBe(true);
    expect(b.codes('left')).toEqual(['KeyQ']);
  });

  it('names keys for people', () => {
    expect(['KeyA', 'ArrowLeft', 'ShiftLeft', 'Digit1', 'Space'].map(keyName)).toEqual(['A', '←', 'Shift', '1', 'Space']);
  });
});
