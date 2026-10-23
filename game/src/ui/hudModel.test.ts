import { describe, expect, it } from 'vitest';
import { GameEventBus } from '../core/events';
import { CRACK_MS, HudModel, MAX_CELLS } from './hudModel';

const at = { x: 0, y: 0 };

describe('battery cells', () => {
  it('starts full and cracks the lost cell before it empties', () => {
    const hud = new HudModel();
    expect(hud.cells(0)).toEqual(Array(MAX_CELLS).fill('full'));
    hud.setHealth(4, 100);
    expect(hud.cells(100)).toEqual(['full', 'full', 'full', 'full', 'cracked']);
    expect(hud.cells(100 + CRACK_MS)).toEqual(['full', 'full', 'full', 'full', 'empty']);
  });

  it('runs the crack from 0 to 1 over CRACK_MS, for the crack animation', () => {
    const hud = new HudModel();
    hud.setHealth(4, 100);
    expect(hud.crackProgress(4, 100)).toBe(0);
    expect(hud.crackProgress(4, 100 + CRACK_MS / 2)).toBeCloseTo(0.5);
    expect(hud.crackProgress(4, 100 + CRACK_MS)).toBe(1);
    expect(hud.crackProgress(0, 100)).toBe(0);
  });

  it("cracks two cells for Jenny's charge and clamps to the battery", () => {
    const hud = new HudModel();
    hud.setHealth(3, 0);
    expect(hud.cells(1)).toEqual(['full', 'full', 'full', 'cracked', 'cracked']);
    hud.setHealth(-4, 0);
    expect(hud.health).toBe(0);
    hud.setHealth(9, 0);
    expect(hud.cells(1)).toEqual(Array(MAX_CELLS).fill('full'));
  });

  it('follows hits, death and the coffee machine on the event bus', () => {
    const bus = new GameEventBus();
    const hud = new HudModel();
    const stop = hud.listen(bus, () => 0);
    bus.emit('player-hit', { health: 2, damage: 1, position: at });
    expect(hud.health).toBe(2);
    bus.emit('player-died', { position: at });
    expect(hud.health).toBe(0);
    bus.emit('save', { checkpoint: 'coffee-1', region: 'rusty-creek', position: at });
    expect(hud.health).toBe(MAX_CELLS);
    stop();
    bus.emit('player-hit', { health: 1, damage: 1, position: at });
    expect(hud.health).toBe(MAX_CELLS);
  });
});

describe('boss bar', () => {
  it("shows only during Jenny's fight and hides when she is defeated", () => {
    const bus = new GameEventBus();
    const hud = new HudModel();
    hud.listen(bus, () => 0);
    expect(hud.boss).toBeNull();
    hud.showBoss('Jenny', 30);
    hud.setBossHealth(12);
    expect(hud.bossFraction()).toBeCloseTo(0.4);
    hud.setBossHealth(-5);
    expect(hud.bossFraction()).toBe(0);
    bus.emit('boss-defeated', { id: 'jenny', position: at });
    expect(hud.boss).toBeNull();
  });

  it('keeps the glitch meter hidden in the jam slice', () => {
    expect(new HudModel().glitchMeterVisible).toBe(false);
  });
});
