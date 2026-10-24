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
    // A released jump keeps its launch speed until it can still reach the 52px minimum under the cut gravity,
    // then brakes hard: a tap hop tops out in ~0.18 s instead of floating up for ~0.3 s at a clamped speed
    // (the "slow jump when spamming"). A late release brakes from where it is.
    const remainingRise = Math.max(0, TAP_HEIGHT - (state.origin - body.y));
    if (body.vy * body.vy >= 2 * CUT_GRAVITY * remainingRise) body.vy = Math.min(0, body.vy + (CUT_GRAVITY - GRAVITY) * dt);
  }
}
/** Gravity while a released jump is still rising (the body adds GRAVITY; the jump adds the rest). */
export const CUT_GRAVITY = 3 * GRAVITY;
/** A walk-off drop shorter than this lands without a landing pose (a step between deck plates, not a fall). */
export const STEP_DROP = 10;

/** How long each landing holds the pose, in s: the land and hard-landing clips' lengths (clipLength, anims.json). */
export interface LandingTimes { soft: number; hard: number }
export const LANDING_TIMES: LandingTimes = { soft: 2 / 12, hard: 4 / 12 }; // fallback before the atlases load

export function landing(body: Body, state: Jump, wasGrounded: boolean, dt: number, times: LandingTimes = LANDING_TIMES) {
  state.landing = Math.max(0, state.landing - dt);
  state.peak = Math.min(state.peak, body.y);
  if (state.active) state.height = Math.max(state.height, state.origin - body.y);
  if (!wasGrounded && body.grounded) {
    const drop = body.y - state.peak;
    state.hard = drop >= 152; // Two body heights; tune with the route playtest.
    // Moving, a soft landing is its crouch only and a hard one its impact, then the stride takes over;
    // a walk-off step is no landing at all. Standing, both play out.
    const moving = Math.abs(body.vx) > 5;
    state.landing = !state.active && drop < STEP_DROP ? 0
      : state.hard ? moving ? times.hard * 0.6 : times.hard : moving ? times.soft / 2 : times.soft;
    state.active = false; state.forced = false; state.peak = body.y;
  }
}
