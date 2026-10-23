import { GameEventBus } from '../core/events';

/** docs/02: 5 battery cells; a hit costs 1, Jenny's charge 2; coffee refills everything. */
export const MAX_CELLS = 5;
/** How long a lost cell shows its crack before it reads as empty. */
export const CRACK_MS = 600;

export type CellState = 'full' | 'cracked' | 'empty';

export interface BossBar { name: string; health: number; max: number }

/** What the HUD shows; the scene only draws this. */
export class HudModel {
  health = MAX_CELLS;
  private cracks: { cell: number; until: number }[] = [];
  boss: BossBar | null = null;
  /** The glitch meter unlocks after Region 1 (docs/02); the jam slice never shows it. */
  readonly glitchMeterVisible = false;

  /** Subscribe to the shared bus; call the returned function on scene shutdown. */
  listen(bus: GameEventBus, now: () => number): () => void {
    const stops = [
      bus.on('player-hit', ({ health }) => this.setHealth(health, now())),
      bus.on('player-died', () => this.setHealth(0, now())),
      bus.on('save', () => this.setHealth(MAX_CELLS, now())),
      bus.on('boss-defeated', () => this.hideBoss()),
    ];
    return () => stops.forEach((stop) => stop());
  }

  setHealth(health: number, at: number): void {
    const next = Math.max(0, Math.min(MAX_CELLS, Math.round(health)));
    for (let cell = next; cell < this.health; cell++) this.cracks.push({ cell, until: at + CRACK_MS });
    if (next > this.health) this.cracks = this.cracks.filter((c) => c.cell >= next);
    this.health = next;
  }

  cells(at: number): CellState[] {
    this.cracks = this.cracks.filter((c) => c.until > at);
    return Array.from({ length: MAX_CELLS }, (_, cell): CellState => {
      if (cell < this.health) return 'full';
      return this.cracks.some((c) => c.cell === cell) ? 'cracked' : 'empty';
    });
  }

  /** Jenny's fight (M4) starts the bar; it is hidden everywhere else. */
  showBoss(name: string, max: number): void { this.boss = { name, health: max, max }; }
  setBossHealth(health: number): void {
    if (this.boss) this.boss.health = Math.max(0, Math.min(this.boss.max, health));
  }
  hideBoss(): void { this.boss = null; }

  bossFraction(): number { return this.boss ? this.boss.health / this.boss.max : 0; }
}
