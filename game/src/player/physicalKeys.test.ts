import { describe, expect, it } from 'vitest';
import { CODES, KeyState } from './physicalKeys';

describe('physical keys (playtest 24 Oct: WASD did nothing for one player)', () => {
  it('reads W/A/S/D by place on the board, whatever letter the layout or input method reports', () => {
    const keys = new KeyState();
    // An AZERTY board or an active IME still reports code 'KeyA' for the key right of Caps Lock.
    keys.press('KeyA');
    expect(keys.any(CODES.left)).toBe(true);
    expect(keys.any(CODES.right)).toBe(false);
    keys.release('KeyA');
    expect(keys.any(CODES.left)).toBe(false);
  });

  it('has both laptop layouts, WASD + J/K/L and arrows + Z/X/C, with no key doing two things', () => {
    const has = (codes: readonly string[], ...want: string[]) => want.every(code => codes.includes(code));
    expect(has(CODES.attack, 'KeyJ', 'KeyX')).toBe(true);
    expect(has(CODES.jump, 'KeyK', 'KeyZ', 'Space')).toBe(true);
    expect(has(CODES.dodge, 'KeyL', 'KeyC', 'ShiftLeft', 'ShiftRight')).toBe(true);
    const all = Object.values(CODES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('attacks on J or X, and clears every key on blur', () => {
    const keys = new KeyState();
    keys.press('KeyX');
    expect(keys.any(CODES.attack)).toBe(true);
    keys.press('KeyJ'); keys.press('KeyW');
    keys.clear();
    expect(keys.any(CODES.attack) || keys.any(CODES.up)).toBe(false);
  });
});
