export const WALK_SPEED = 3.5 * 43;
export const RUN_SPEED = 6 * 43;
export const RUN_DELAY = 0.4;
export interface Movement { vx: number; held: number; direction: number; facing: -1 | 1 }
export const movement = (): Movement => ({ vx: 0, held: 0, direction: 0, facing: 1 });
export const approach = (value: number, target: number, amount: number) =>
  value + Math.sign(target - value) * Math.min(Math.abs(target - value), amount);

/** Dead zone prevents stick drift from starting the run timer. D-pad is digital. */
export function horizontal(left: boolean, right: boolean, stick = 0, padLeft = false, padRight = false) {
  const keys = Number(right) - Number(left);
  const pad = Number(padRight) - Number(padLeft);
  if (left || right) return keys;
  if (padLeft || padRight) return pad;
  return Math.abs(stick) <= 0.2 ? 0 : Math.sign(stick) * Math.min(1, (Math.abs(stick) - 0.2) / 0.8);
}

export function move(state: Movement, axis: number, dt: number) {
  const direction = Math.sign(axis);
  state.held = direction === 0 ? 0 : direction === state.direction ? state.held + dt : dt;
  state.direction = direction;
  if (direction) state.facing = direction as -1 | 1;
  const speed = state.held + 1e-9 >= RUN_DELAY ? RUN_SPEED : WALK_SPEED;
  state.vx = approach(state.vx, axis * speed, (direction ? 1500 : 2000) * dt);
}
