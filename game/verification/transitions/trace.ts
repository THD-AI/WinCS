/**
 * The hero's locomotion transitions (#156 "Smooth transitions"), traced with the game's own code: movement.ts
 * paces the body, jump.ts its arc and landing, animation.ts picks the frame – as player.ts wires them, on flat
 * ground at the game's 120 Hz step. Writes one trace per transition; scripts/transition_gifs.py draws them.
 *
 *   node --experimental-transform-types game/verification/transitions/trace.ts > tmp/transitions.json
 */
import { readFileSync } from 'node:fs';
import { catalogue, clipLength, LocomotionAnimation, type MotionPose } from '../../src/player/animation.ts';
import { move, movement, RUN_SPEED, WALK_SPEED } from '../../src/player/movement.ts';
import { GRAVITY, JUMP_SPEED, jumpState, landing, LANDING_TIMES } from '../../src/player/jump.ts';
import type { AnimationTable } from '../../src/stage/assets.ts';

const SPRITES = new URL('../../public/assets/sprites/', import.meta.url);
const BOARDS = ['hero-move', 'hero-run', 'hero-air', 'hero-idle'];
const tables = Object.fromEntries(BOARDS.map(board =>
  [board, JSON.parse(readFileSync(new URL(`${board}.anims.json`, SPRITES), 'utf8')) as AnimationTable]));
const clips = catalogue(tables);
// The landing holds, as player.ts measures them from the jump row's landing and the hard landing.
const times = clips.land && clips['hard-landing']
  ? { soft: clipLength(clips.land, 'land'), hard: clipLength(clips['hard-landing'], 'hard-landing') } : LANDING_TIMES;

/** One input phase: hold right (axis), and/or press jump at its start, for `seconds`. */
type Phase = { seconds: number; axis: number; jump?: boolean };
const SCRIPTS: Record<string, Phase[]> = {
  'idle-walk-idle': [{ seconds: 0.5, axis: 0 }, { seconds: 0.35, axis: 1 }, { seconds: 0.9, axis: 0 }],
  // Let go for a moment and hold again: the run timer restarts, so the body slows to a walk, then runs again.
  'walk-run-walk-run': [{ seconds: 1.4, axis: 1 }, { seconds: 0.05, axis: 0 }, { seconds: 1.0, axis: 1 }, { seconds: 0.9, axis: 0 }],
  'idle-run-idle': [{ seconds: 0.4, axis: 0 }, { seconds: 1.4, axis: 1 }, { seconds: 1.1, axis: 0 }],
  'idle-jump-land': [{ seconds: 0.4, axis: 0 }, { seconds: 1.5, axis: 0, jump: true }],
  'run-jump-land-run': [{ seconds: 1.0, axis: 1 }, { seconds: 1.4, axis: 1, jump: true }],
};

const STEP = 1 / 120;
const out: Record<string, unknown> = {};
for (const [name, phases] of Object.entries(SCRIPTS)) {
  const body = { x: 0, y: 0, vx: 0, vy: 0, grounded: true };
  const motion = movement(), air = jumpState(0), animation = new LocomotionAnimation(clips, () => 0.5);
  const frames: { t: number; x: number; y: number; board: string; frame: string; pose: MotionPose }[] = [];
  let t = 0;
  for (const phase of phases) {
    if (phase.jump) { body.vy = -JUMP_SPEED; body.grounded = false; air.active = true; air.origin = body.y; }
    for (let n = 0; n < Math.round(phase.seconds / STEP); n++) {
      const wasGrounded = body.grounded;
      move(motion, phase.axis, STEP);
      body.vx = motion.vx;
      body.x += body.vx * STEP;
      if (!body.grounded) {
        body.vy += GRAVITY * STEP; body.y += body.vy * STEP;
        if (body.y >= 0) { body.y = 0; body.vy = 0; body.grounded = true; }
      }
      landing(body, air, wasGrounded, STEP, times);
      // player.ts's choice of pose, on flat ground with no ladder.
      const desired: MotionPose = air.landing > 0 ? air.hard ? 'hard-landing' : 'land'
        : !body.grounded ? body.vy < 0 ? 'jump' : 'fall'
        : Math.abs(body.vx) > (WALK_SPEED + RUN_SPEED) / 2 ? 'run' : Math.abs(body.vx) > 5 ? 'walk' : 'idle';
      const pose = animation.update(desired, STEP, Math.abs(body.vx), { vy: body.vy, launch: JUMP_SPEED });
      frames.push({ t: +t.toFixed(4), x: +body.x.toFixed(2), y: +body.y.toFixed(2), ...pose, pose: desired });
      t += STEP;
    }
  }
  out[name] = frames;
}
process.stdout.write(JSON.stringify(out));
