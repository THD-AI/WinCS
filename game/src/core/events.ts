export type RegionState = 'clean' | 'anomaly';
export interface Position { x: number; y: number }

/** Shared system → story/UI notifications; coordinates are stage pixels. */
export interface GameEvents {
  'enemy-defeated': { id: string; kind: string; position: Position };
  'player-hit': { health: number; damage: number; position: Position };
  'player-died': { position: Position };
  'region-turned': { region: string; state: RegionState };
  'boss-defeated': { id: string; position: Position };
  'save': { checkpoint: string; region: string; position: Position };
  /** The hero's body entered an interact box (collision `interact`); fires once per entry. `state`: a `turn` box's target. */
  'trigger-entered': { id: string; kind: string; region: string; position: Position; state?: RegionState };
  /**
   * The prologue's pond shows what isn't there (docs/03, beat 'something wrong'): fired once when the hero
   * reaches the jetty edge, before Dexter's shove. `position` is the water point under the edge (stage px);
   * the water renderer reacts by showing the wrong reflection there for `duration` ms (then the frame tears).
   */
  'anomaly-reveal': { id: string; region: string; position: Position; duration: number };
  /** The hero fell out of the level (below every floor, not into water): debug mode keeps a screenshot (stage/fallCapture.ts). */
  'fell-out': { region: string; position: Position; lastSafe: Position };
}

type Listener<T> = (payload: T) => void;

export class GameEventBus {
  private listeners = new Map<keyof GameEvents, Set<Listener<never>>>();

  on<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<Listener<never>>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  off<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    // Registration enforces the key/payload pairing; storage erases only that type.
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload as never);
  }

  clear(): void { this.listeners.clear(); }
}

export const gameEvents = new GameEventBus();
