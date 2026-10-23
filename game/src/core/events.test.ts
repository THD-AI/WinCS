import { expect, it } from 'vitest';
import { GameEventBus } from './events';

it('isolates events and releases subscribers on scene shutdown', () => {
  const bus = new GameEventBus();
  const seen: number[] = [];
  const stop = bus.on('player-hit', ({ health }) => seen.push(health));
  bus.emit('player-died', { position: { x: 0, y: 0 } });
  bus.emit('player-hit', { health: 4, damage: 1, position: { x: 0, y: 0 } });
  stop();
  bus.emit('player-hit', { health: 3, damage: 1, position: { x: 0, y: 0 } });
  expect(seen).toEqual([4]);
  bus.on('player-hit', ({ health }) => seen.push(health));
  bus.clear();
  bus.emit('player-hit', { health: 2, damage: 1, position: { x: 0, y: 0 } });
  expect(seen).toEqual([4]);
});
