import type { Position } from '../core/events';
export const MAX_HEALTH = 5;
export const KNOCK_SPEED = 258;
export const KNOCK_TIME = 0.25;
interface Actor { boss: boolean; reset: () => void }

/** Per-stage life state. A shared boss set survives scene restarts. */
export class Life {
  health = MAX_HEALTH;
  invulnerable = 0;
  knock = 0;
  dead = 0;
  checkpoint: Position;
  safe: Position;
  private direction = 1;
  private actors = new Map<string, Actor>();
  constructor(spawn: Position, readonly defeatedBosses = new Set<string>()) {
    this.checkpoint = { ...spawn }; this.safe = { ...spawn };
  }
  hit(damage: number, direction = 1) {
    if (!Number.isInteger(damage) || damage <= 0) throw new Error('Damage must be a positive integer');
    if (this.dead > 0 || this.invulnerable > 1e-9) return false;
    this.health = Math.max(0, this.health - damage);
    this.invulnerable = 1; this.knock = KNOCK_TIME; this.direction = direction < 0 ? -1 : 1;
    if (this.health === 0) this.dead = 1;
    return true;
  }
  tick(dt: number) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const knocked = Math.min(this.knock, dt);
    this.knock = Math.max(0, this.knock - dt);
    if (this.knock < 1e-9) this.knock = 0;
    const result = { dx: this.dead > 0 ? 0 : this.direction * KNOCK_SPEED * knocked,
      knockFinished: knocked > 0 && this.knock === 0, respawned: false };
    if (this.dead > 0) {
      this.dead = Math.max(0, this.dead - dt);
      if (this.dead < 1e-9) {
        this.dead = 0; this.health = MAX_HEALTH; this.invulnerable = 1; this.knock = 0;
        this.safe = { ...this.checkpoint }; result.respawned = true;
        for (const [id, actor] of [...this.actors]) if (!actor.boss || !this.defeatedBosses.has(id)) actor.reset();
      }
    }
    return result;
  }
  rememberSafe(position: Position) { this.safe = { ...position }; }
  resetSafe() { this.knock = 0; return { ...this.safe }; }
  heal(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Healing must be a positive integer');
    if (this.dead > 0) return false;
    const next = Math.min(MAX_HEALTH, this.health + amount);
    const changed = next !== this.health; this.health = next; return changed;
  }
  save(position: Position) {
    if (this.dead > 0) return false;
    this.checkpoint = { x: position.x, y: position.y }; this.safe = { ...this.checkpoint }; this.health = MAX_HEALTH;
    return true;
  }
  register(id: string, reset: () => void, boss = false) {
    const actor = { boss, reset }; this.actors.set(id, actor);
    return () => { if (this.actors.get(id) === actor) this.actors.delete(id); };
  }
}
