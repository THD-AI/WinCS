import { describe, expect, it } from 'vitest';
import { Life } from './life';
describe('health and respawn', () => {
  it('starts with five cells, rejects hits for one second and charges two for Jenny', () => {
    const life = new Life({ x: 100, y: 500 });
    expect(life.health).toBe(5); expect(life.hit(1)).toBe(true); expect(life.health).toBe(4);
    life.tick(0.99); expect(life.hit(2)).toBe(false);
    life.tick(0.01); expect(life.hit(2)).toBe(true); expect(life.health).toBe(2);
  });
  it('integrates about 1.5m of knockback in either direction', () => {
    for (const direction of [-1, 1]) {
      const life = new Life({ x: 100, y: 500 }); life.hit(1, direction);
      let distance = 0;
      for (let i = 0; i < 60; i++) distance += life.tick(1 / 120).dx;
      expect(distance).toBeCloseTo(direction * 64.5, 7);
    }
  });
  it('restores full health at the coffee checkpoint and resets normals but not defeated bosses', () => {
    const life = new Life({ x: 100, y: 500 }); life.save({ x: 1400, y: 400 });
    let normal = 0, boss = 0, liveBoss = 0;
    life.register('rover-1', () => normal++);
    life.register('jenny', () => boss++, true);
    life.register('other-boss', () => liveBoss++, true);
    life.defeatedBosses.add('jenny'); life.hit(5);
    expect(life.tick(0.9).respawned).toBe(false); expect(life.heal(1)).toBe(false);
    expect(life.tick(0.1).respawned).toBe(true);
    expect(life.health).toBe(5); expect(life.safe).toEqual({ x: 1400, y: 400 });
    expect(normal).toBe(1); expect(boss).toBe(0); expect(liveBoss).toBe(1);
    life.tick(1); expect(normal).toBe(1); expect(life.defeatedBosses.has('jenny')).toBe(true);
  });
  it('keeps no-go resets free and hazard resets at the last safe position', () => {
    const life = new Life({ x: 100, y: 500 }); life.rememberSafe({ x: 800, y: 300 });
    expect(life.resetSafe()).toEqual({ x: 800, y: 300 }); expect(life.health).toBe(5);
    life.hit(1); expect(life.resetSafe()).toEqual({ x: 800, y: 300 }); expect(life.health).toBe(4);
    expect(life.knock).toBe(0); expect(life.checkpoint).toEqual({ x: 100, y: 500 });
  });
  it('caps healing, copies checkpoints and unregisters removed actors', () => {
    const life = new Life({ x: 100, y: 500 }); life.hit(2); expect(life.heal(1)).toBe(true);
    expect(life.health).toBe(4); life.heal(10); expect(life.health).toBe(5);
    const position = { x: 600, y: 350 }; life.save(position); position.x = 0;
    expect(life.checkpoint.x).toBe(600);
    let resets = 0; const off = life.register('removed', () => resets++); off();
    life.tick(1); life.hit(5); life.tick(1); expect(resets).toBe(0);
  });
});
