import { describe, expect, it } from 'vitest';
import { CoffeeUse, coffeeAlpha } from './coffee';
import { Life } from './life';
import { parseCollision, placeCollision } from '../stage/collision';
import type { Body } from '../player/body';
import raw from '../../../art/stages/rusty-creek/rc-1-0.anomaly.collision.json';
import clips from '../../public/assets/sprites/hero-hurt.anims.json';

const chunk = placeCollision(parseCollision(raw, 'rc-1-0', 'anomaly'), [2160, 0]);
const machines = chunk.world.interact;
const body = (): Body => ({ x: 3950, y: 537, vx: 0, vy: 0, grounded: true });
describe('coffee save interaction', () => {
  it('flickers for one 12 fps frame every two seconds while idle', () => {
    expect(coffeeAlpha(0)).toBe(0.65); expect(coffeeAlpha(82)).toBe(0.65);
    expect(coffeeAlpha(84)).toBe(1); expect(coffeeAlpha(1999)).toBe(1);
    expect(coffeeAlpha(2000)).toBe(0.65); expect(coffeeAlpha(2084)).toBe(1);
  });
  it('uses the authored 40×80 machine at the translated walk surface and the approved drink timing', () => {
    expect(machines.find(box => box.kind === 'coffee-machine')).toMatchObject({ id: 'coffee-1', x: 3930, y: 457, w: 40, h: 80 });
    expect(clips.interact).toEqual({ frames: 3, fps: 12, loop: false });
    expect(clips.interact.frames / clips.interact.fps).toBe(0.25);
    expect(new CoffeeUse().step(true, body(), true, machines)?.id).toBe('coffee-1');
  });
  it('saves once per fresh Up edge, never once per rendered frame', () => {
    const use = new CoffeeUse(), player = body();
    expect(use.step(true, player, true, machines)?.id).toBe('coffee-1');
    expect(use.step(true, player, true, machines)).toBeUndefined();
    use.step(false, player, true, machines);
    expect(use.step(true, player, true, machines)?.id).toBe('coffee-1');
  });
  it('does not auto-save when walking into range with Up held', () => {
    const use = new CoffeeUse(), player = body(); player.x = 3800;
    expect(use.step(true, player, true, machines)).toBeUndefined();
    player.x = 3950;
    expect(use.step(true, player, true, machines)).toBeUndefined();
  });
  it('rejects air, knockback, death, climbing and non-coffee interactables', () => {
    const player = body();
    expect(new CoffeeUse().step(true, player, false, machines)).toBeUndefined();
    player.grounded = false;
    expect(new CoffeeUse().step(true, player, true, machines)).toBeUndefined();
    player.grounded = true;
    expect(new CoffeeUse().step(true, player, true, [{ x: 3930, y: 457, w: 40, h: 80, kind: 'sign' }])).toBeUndefined();
  });
  it('refills at the real machine, copies the checkpoint, and respawns there at full health', () => {
    const player = body(), life = new Life({ x: 120, y: 461 }); life.health = 2;
    const machine = new CoffeeUse().step(true, player, true, machines);
    expect(machine?.id).toBe('coffee-1'); expect(life.save(player)).toBe(true);
    expect(life.health).toBe(5); player.x += 200;
    expect(life.hit(5)).toBe(true); expect(life.tick(1).respawned).toBe(true);
    expect(life.checkpoint).toEqual({ x: 3950, y: 537 }); expect(life.health).toBe(5);
  });
});
