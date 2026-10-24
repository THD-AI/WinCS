import { describe, expect, it } from 'vitest';
import { actionEdges, attackClick } from './action-input';
import { Guard } from './guard';
import { Sweeps } from './sweeps';
describe('Act edge routing with guard', () => {
  it('retains a tap completed between rendered frames and produces a chair contact', () => {
    // Actual Phaser Key.onUp state: isDown=false, _justDown=false, _justUp=true.
    const edge = actionEdges(false, false, false, true), guard = new Guard(), sweep = new Sweeps();
    expect(edge.pressed).toBe(true); expect(edge.released).toBe(true);
    if (edge.pressed) guard.press(1);
    if (edge.released && guard.release()) sweep.press(1);
    sweep.step(4 / 12); let hits = 0;
    sweep.hit({ x: 100, y: 500 }, [{ id: 'rover', bounds: () => ({ x: 125, y: 475, w: 31, h: 25 }), hit: () => { hits++; return true; } }]);
    expect(hits).toBe(1);
  });
  it('does not turn a held guard release into a fresh attack press', () => {
    const guard = new Guard(); guard.press(1); guard.step(2 / 12);
    const edge = actionEdges(false, true, false, true);
    expect(edge.pressed).toBe(false); expect(edge.released).toBe(true);
    expect(guard.release()).toBe(false);
  });
  it('retains gamepad press/release edges without keyboard flags', () => {
    expect(actionEdges(true, false, false, false)).toEqual({ pressed: true, released: false });
    expect(actionEdges(true, true, false, false)).toEqual({ pressed: false, released: false });
    expect(actionEdges(false, true, false, false)).toEqual({ pressed: false, released: true });
  });
  it('takes a left click on the canvas as Act, never a click on the menu, another button or a touch', () => {
    const canvas = {}, menu = {};
    expect(attackClick(0, false, canvas, canvas)).toBe(true);
    expect(attackClick(0, false, menu, canvas)).toBe(false);
    expect(attackClick(2, false, canvas, canvas)).toBe(false);
    expect(attackClick(0, true, canvas, canvas)).toBe(false);
  });
});
