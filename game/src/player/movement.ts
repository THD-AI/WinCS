/**
 * Speeds at 43 px/m (the world's scale: a 1.83 m person is 76 px of collision body), from the approved cycles (#156).
 * The walk and run play by distance. Since the hero is drawn 1.5x (114 px, 24 Oct) their strides are 65 and 123 px,
 * so at 2.2 m/s the walk cycles at ~12 fps and the run at ~13 fps – the art's own 12 fps key poses, feet planted.
 * The old 3.5 / 6 m/s were 2.3–2.5x faster than the feet could carry the body (the moonwalk). A running jump still
 * clears ~157 px (collision_check: 140).
 */
export const WALK_SPEED = 2.2 * 43;
export const RUN_SPEED = 4.6 * 43;
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
