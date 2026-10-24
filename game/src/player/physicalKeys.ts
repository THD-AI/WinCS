import type Phaser from 'phaser';

/**
 * Keys by their PHYSICAL position (`KeyboardEvent.code`), next to Phaser's keys (which go by `keyCode`).
 * Playtest (24 Oct): WASD did not move the hero for one player while the arrows did. `keyCode` depends on the
 * keyboard layout and is 229 for every letter while an input method (IME) is active, so Phaser never saw W/A/S/D;
 * `code` is the key's place on the board ('KeyW' is the key left of E on any layout), so it always works.
 */
export const CODES = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyK'],
  /** The chair: J, and X for players on the arrow keys (playtest 24 Oct). */
  attack: ['KeyJ', 'KeyX'],
} as const;

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
