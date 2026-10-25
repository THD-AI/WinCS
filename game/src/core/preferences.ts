/**
 * The player's own settings that outlast a page load (Settings tab). Pure – no Phaser here; saved in the browser,
 * and a broken or blocked storage just means the defaults.
 */
export interface Preferences {
  /** Playtest R1: the hero blends into the autumn scenery – a brighter, cooler outline lifts him off it. */
  heroOutline: boolean;
}

export const PREFERENCES_KEY = 'deggster.preferences';
const DEFAULTS: Preferences = { heroOutline: false };

interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void }
type Listener = (value: Preferences) => void;

export class PreferenceStore {
  private value: Preferences = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  constructor(private store?: Store) {
    try {
      const saved = JSON.parse(store?.getItem(PREFERENCES_KEY) ?? '{}') as Partial<Record<keyof Preferences, unknown>>;
      if (typeof saved.heroOutline === 'boolean') this.value.heroOutline = saved.heroOutline;
    } catch { /* the defaults */ }
  }
  get state(): Preferences { return this.value; }
  set(patch: Partial<Preferences>): void {
    this.value = { ...this.value, ...patch };
    try { this.store?.setItem(PREFERENCES_KEY, JSON.stringify(this.value)); } catch { /* not saved */ }
    for (const listener of this.listeners) listener(this.value);
  }
  on(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

function browserStore(): Store | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export const preferences = new PreferenceStore(browserStore());

/** The hero's rim: the actors' warm one, or the brighter cool outline when the player asked for it. */
export const HERO_OUTLINE = { colour: 0xe8fbff, strength: 0.95 } as const;
export function heroRim(prefs: Preferences, actor: { colour: number; strength: number }) {
  return prefs.heroOutline ? HERO_OUTLINE : actor;
}
