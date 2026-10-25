import type Phaser from 'phaser';

/**
 * Keys by their PHYSICAL position (`KeyboardEvent.code`), next to Phaser's keys (which go by `keyCode`).
 * Playtest (24 Oct): WASD did not move the hero for one player while the arrows did. `keyCode` depends on the
 * keyboard layout and is 229 for every letter while an input method (IME) is active, so Phaser never saw W/A/S/D;
 * `code` is the key's place on the board ('KeyW' is the key left of E on any layout), so it always works.
 */
export const DEFAULT_CODES = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  /**
   * The two laptop layouts (playtest 24 Oct): WASD with J attack / K jump / L dodge, or the arrows with
   * Z jump / X attack / C dodge – plus Space to jump and Shift to dodge on either.
   */
  jump: ['Space', 'KeyK', 'KeyZ'],
  /** The chair: J, and X for players on the arrow keys (playtest 24 Oct). */
  attack: ['KeyJ', 'KeyX'],
  /** The dodge-dash (dodge.ts): L next to J/K, C next to X, and either Shift. */
  dodge: ['KeyL', 'KeyC', 'ShiftLeft', 'ShiftRight'],
} as const;

export type Action = keyof typeof DEFAULT_CODES;
export const ACTIONS = Object.keys(DEFAULT_CODES) as Action[];
/** Where the player's own keys are kept (per browser; the game has no accounts). */
export const BINDINGS_KEY = 'deggster.keys';
/** Keys the game keeps for itself: the menu, the map, the debug keys. */
const RESERVED = new Set(['Escape', 'Tab', 'F2', 'F3', 'F4', 'F5', 'F8', 'F9', 'F10']);

interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/**
 * The keys of every action (playtest M5, rebindable keys in Settings). Each action starts with its defaults; the
 * player can give it one key of their own instead. A key belongs to one action: binding it takes it from any other.
 * Saved in the browser (a broken or blocked storage just means the defaults).
 */
export class Bindings {
  private own: Partial<Record<Action, string[]>> = {};
  constructor(private store?: Store) {
    try {
      const saved = JSON.parse(store?.getItem(BINDINGS_KEY) ?? '{}') as Record<string, unknown>;
      for (const action of ACTIONS) {
        const codes = saved[action];
        if (Array.isArray(codes) && codes.every(c => typeof c === 'string')) this.own[action] = codes;
      }
    } catch { this.own = {}; }
  }
  codes(action: Action): readonly string[] {
    return this.own[action] ?? DEFAULT_CODES[action].filter(code => !this.takenByOwn(code, action));
  }
  isDefault(action: Action): boolean { return !this.own[action]; }
  /** Give the action this key alone; false for a key the game keeps (Esc, Tab, the debug keys). */
  set(action: Action, code: string): boolean {
    if (!code || RESERVED.has(code)) return false;
    for (const other of ACTIONS) {
      if (other !== action && this.own[other]) this.own[other] = this.own[other]!.filter(c => c !== code);
    }
    this.own[action] = [code];
    this.save();
    return true;
  }
  reset(): void { this.own = {}; this.save(); }
  /** A key the player gave to another action is no longer one of this action's defaults. */
  private takenByOwn(code: string, action: Action): boolean {
    return ACTIONS.some(other => other !== action && this.own[other]?.includes(code));
  }
  private save(): void {
    try {
      if (Object.keys(this.own).length) this.store?.setItem(BINDINGS_KEY, JSON.stringify(this.own));
      else this.store?.removeItem(BINDINGS_KEY);
    } catch { /* blocked storage: the keys last until the page closes */ }
  }
}

function browserStore(): Store | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

/** The game's bindings (Settings → Keys changes them). */
export const bindings = new Bindings(browserStore());

/** The keys of every action, as bound right now. */
export const CODES: { readonly [A in Action]: readonly string[] } = Object.defineProperties({}, Object.fromEntries(
  ACTIONS.map(action => [action, { get: () => bindings.codes(action), enumerable: true }]))) as never;

/** A key's name for people: KeyA → A, ArrowLeft → ←, ShiftLeft → Shift, Digit1 → 1. */
export function keyName(code: string): string {
  const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  if (arrows[code]) return arrows[code];
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code);
  if (m) return m[1];
  return code.replace(/(Left|Right)$/, '').replace(/^Bracket/, '').replace(/^Semicolon$/, ';') || code;
}

/** Pure key state, so it is tested without a browser. */
export class KeyState {
  private down = new Set<string>();
  press(code: string): void { if (code) this.down.add(code); }
  release(code: string): void { this.down.delete(code); }
  clear(): void { this.down.clear(); }
  any(codes: readonly string[]): boolean { return codes.some(code => this.down.has(code)); }
}

/**
 * One shared state per game, fed by window listeners. It reads as up while the scene's keyboard is disabled (the
 * prologue finale takes control that way), and clears on blur so a key released outside the window never sticks.
 */
let shared: KeyState | undefined;
export function physicalKeys(scene: Phaser.Scene): { any(codes: readonly string[]): boolean } {
  if (!shared && typeof window !== 'undefined') {
    const state = new KeyState();
    window.addEventListener('keydown', event => state.press(event.code));
    window.addEventListener('keyup', event => state.release(event.code));
    window.addEventListener('blur', () => state.clear());
    shared = state;
  }
  return { any: codes => !!shared && scene.input.keyboard?.enabled !== false && shared.any(codes) };
}
