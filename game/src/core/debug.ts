/**
 * Debug mode's switches (the menu's Debug tab, docs/02 "Menu and debug mode"). One small store the menu writes
 * and the stage reads, so a playtest screenshot shows exactly what was on: which layers are hidden, whether the
 * purple backdrop, the collision, the actors' minds and the FPS are drawn. Pure – no Phaser here.
 */
export interface DebugState {
  /** Debug mode itself; every other switch only shows while it is on. */
  on: boolean;
  /** The back of the world painted purple, so a hole in any plate shows at once. */
  backdrop: boolean;
  /** Walk lines, one-way beams, ladders, walls, water, hazards and triggers. */
  collision: boolean;
  /** Hitboxes, facing, sight, patrol paths and state of the hero, the enemies, Jenny and Dexter. */
  actors: boolean;
  /** Frame rate, the hero's position and chunk. */
  stats: boolean;
  /** Layer ids switched off (e.g. `02-mid`); hidden in every chunk at once. */
  hidden: ReadonlySet<string>;
  /** Camera zoom (Settings; 1 = the game's own framing). Applies with debug mode off too. */
  zoom: number;
}

type Listener = (state: DebugState) => void;

export const ZOOMS = [1, 0.75, 0.5, 0.35] as const;

export class DebugStore {
  private value: DebugState = { on: false, backdrop: false, collision: true, actors: true, stats: true, hidden: new Set(), zoom: 1 };
  private listeners = new Set<Listener>();
  get state(): DebugState { return this.value; }
  set(patch: Partial<Omit<DebugState, 'hidden'>>) { this.value = { ...this.value, ...patch }; this.emit(); }
  toggleLayer(id: string) {
    const hidden = new Set(this.value.hidden);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    this.value = { ...this.value, hidden }; this.emit();
  }
  /** Whether a switch shows right now (debug mode on and the switch on). */
  shows(key: 'backdrop' | 'collision' | 'actors' | 'stats'): boolean { return this.value.on && this.value[key]; }
  layerVisible(id: string): boolean { return !this.value.on || !this.value.hidden.has(id); }
  on(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { for (const listener of this.listeners) listener(this.value); }
}

export const debugStore = new DebugStore();

/** One line per switch that is on – printed in the corner so a screenshot records the debug setup. */
export function describe(state: DebugState): string {
  if (!state.on) return '';
  const on = (['backdrop', 'collision', 'actors', 'stats'] as const).filter(key => state[key]);
  const hidden = [...state.hidden].sort();
  return [`debug: ${on.join(' ') || 'nothing'}`, hidden.length ? `hidden: ${hidden.join(' ')}` : '',
    state.zoom !== 1 ? `zoom ${state.zoom}` : ''].filter(Boolean).join(' | ');
}
