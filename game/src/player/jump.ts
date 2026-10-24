import type { Body } from './body';
export const COYOTE = 0.1;
export const BUFFER = 0.12;
export const GRAVITY = 1200;
export const TAP_HEIGHT = 52;
export const HOLD_HEIGHT = 96;
export const JUMP_SPEED = 485; // Semi-implicit 120Hz integration reaches about 96px.
export interface Jump {
  coyote: number; buffer: number; wasDown: boolean; active: boolean;
  origin: number; peak: number; height: number; landing: number; hard: boolean; forced: boolean;
}
export const jumpState = (y: number): Jump => ({ coyote: 0, buffer: 0, wasDown: false, active: false,
  origin: y, peak: y, height: 0, landing: 0, hard: false, forced: false });

export function pogo(body: Body, top: number): Jump {
  body.y = top; body.vy = -JUMP_SPEED; body.grounded = false;
  return { ...jumpState(top), active: true, forced: true };
}

export function jump(body: Body, state: Jump, down: boolean, dt: number) {
  state.coyote = body.grounded ? COYOTE : Math.max(0, state.coyote - dt);
  state.buffer = down && !state.wasDown ? BUFFER : Math.max(0, state.buffer - dt);
  state.wasDown = down;
  if (state.buffer > 1e-9 && state.coyote > 1e-9) {
    body.vy = -JUMP_SPEED; body.grounded = false;
    state.coyote = 0; state.buffer = 0; state.active = true; state.forced = false;
    state.origin = body.y; state.peak = body.y; state.height = 0; state.landing = 0;
  }
  if (!down && state.active && !state.forced && body.vy < 0) {
    // Early releases share a 52px minimum rise; later releases stop at their current height.
    const remainingRise = Math.max(0, TAP_HEIGHT - (state.origin - body.y));
    body.vy = Math.max(body.vy, -Math.sqrt(2 * GRAVITY * remainingRise));
  }
}

/** How long each landing holds the pose, in s: the land and hard-landing clips' lengths (clipLength, anims.json). */
export interface LandingTimes { soft: number; hard: number }
export const LANDING_TIMES: LandingTimes = { soft: 2 / 12, hard: 4 / 12 }; // fallback before the atlases load

export function landing(body: Body, state: Jump, wasGrounded: boolean, dt: number, times: LandingTimes = LANDING_TIMES) {
  state.landing = Math.max(0, state.landing - dt);
  state.peak = Math.min(state.peak, body.y);
  if (state.active) state.height = Math.max(state.height, state.origin - body.y);
  if (!wasGrounded && body.grounded) {
    state.hard = body.y - state.peak >= 152; // Two body heights; tune with the route playtest.
    state.landing = state.hard ? times.hard : times.soft;
    state.active = false; state.forced = false; state.peak = body.y;
  }
}
