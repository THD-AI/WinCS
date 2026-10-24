import type { AnimationClip, AnimationTable } from '../stage/assets';
export interface Clip extends AnimationClip { board: string; name: string; start?: number }
export type Catalogue = Record<string, Clip>;
export type MotionPose = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'ladder' | 'land' | 'hard-landing';
const VARIANTS = ['look-around', 'check-tablet', 'check-wounds'];
const LOOPS = ['idle', 'walk', 'run', 'fall', 'ladder'];
/** Clips the feet are on the ground in: the cycles and the bridges between them. */
const GROUND = ['idle', 'walk', 'run', 'idle-walk', 'walk-run', 'run-start'];
/**
 * Seconds of air a walk-off keeps its stride for: the creek's deck plates and bank blocks meet with 2–5 px gaps
 * and 10–50 px steps, and each one used to flash the fall pose, a landing crouch and a run-start from a stand
 * (the Rusty Creek fidget). A drop shorter than this (about 8 px) is a step, not a fall.
 */
export const FALL_GRACE = 0.12;
/** Idle variants: the key pose each holds (frame, s), and whether it plays back out (its last frame is not a stand). */
export const VARIANT_HOLD: Record<string, { frame: number; hold: number; back?: boolean }> = {
  'look-around': { frame: 2, hold: 0.9 },
  'check-tablet': { frame: 2, hold: 1.4 },
  'check-wounds': { frame: 3, hold: 0.7, back: true },
};
/** Seconds of standing before an idle variant: the first wait, plus a random extra up to the second. */
export const VARIANT_DELAY = [5, 4];
/** Idle loops (0.5 s each) per half breath: the chest rises for two loops and settles for two. */
export const BREATH_LOOPS = 2;
type Step = { clip: string; reverse?: boolean };

export function catalogue(tables: Record<string, AnimationTable>): Catalogue {
  const clips: Catalogue = {};
  for (const [board, table] of Object.entries(tables)) for (const [name, clip] of Object.entries(table)) {
    clips[name] ??= { ...clip, board, name };
  }
  // The jump row ends in its own landing: a crouch, then the stand (jump-07/08), played at the row's fps.
  const jump = clips.jump;
  clips.land = jump ? { ...jump, start: Math.max(0, jump.frames - LAND_FRAMES), frames: Math.min(LAND_FRAMES, jump.frames), loop: false }
    : { ...clips.idle, frames: 1, loop: false };
  return clips;
}

/** Frames at the end of the jump row that are its landing (crouch, stand). */
export const LAND_FRAMES = 2;
/** Frames of the jump row: 0 anticipation, 1–4 rise to the apex, 5–6 descent, then the landing. */
export const JUMP_APEX = 4;
/** A clip's played length in seconds at its own fps (anticipation holds included). */
export function clipLength(clip: AnimationClip, name = '') {
  let total = 0;
  for (let n = 0; n < clip.frames; n++) total += holdFrames(name, n) / clip.fps;
  return total;
}
/** Strong poses held on twos (docs/09 'Stepped timing'): the jump's crouch and the hard landing's impact. */
function holdFrames(clip: string, frame: number) {
  return (clip === 'jump' || clip === 'hard-landing') && frame === 0 ? 2 : 1;
}
/**
 * The jump row's frame for a body in the air, by where it is on its arc rather than by time, so the apex pose is
 * at the apex for every jump height and a walk-off ledge drops into the descent: rising maps vy −launch…0 onto
 * frames 1…apex, falling maps 0…launch onto the descent frames; beyond a jump's own fall, null (the fall loop).
 */
export function arcFrame(vy: number, launch: number, frames: number) {
  const descent = Math.max(JUMP_APEX + 1, frames - LAND_FRAMES - 1);
  if (vy < 0) return 1 + Math.min(JUMP_APEX - 1, Math.floor((1 - Math.min(1, -vy / launch)) * JUMP_APEX));
  const t = vy / launch;
  if (t >= 1) return null;
  return Math.min(descent, JUMP_APEX + 1 + Math.floor(t * (descent - JUMP_APEX)));
}

/** Idle keeps planted feet. Moving rows use contact/down/passing/up twice: contacts 00/04. */
export class LocomotionAnimation {
  clip = 'idle';
  frame = 0;
  reverse = false;
  private elapsed = 0;
  private idleTime = 0;
  private finished = false;
  private queue: Step[] = [];
  private speed = 0;
  private lastVy = 0;
  private wasAirborne = false;
  private airTime = 0;
  private lastGround: MotionPose = 'idle';
  private idleLoops = 0;
  private lastVariant = '';
  private variantDelay: number;
  /** Set by the player at low health: the idle variant is then the check of the wounds. */
  wounded = false;
  constructor(private clips: Catalogue, private random = Math.random) { this.variantDelay = this.nextDelay(); }
  private nextDelay() { return VARIANT_DELAY[0] + this.random() * VARIANT_DELAY[1]; }
  /** 1 while the chest is up: two idle loops in, two out, changing only where the idle clip loops (no pop mid-frame). */
  get breath() { return this.clip === 'idle' && Math.floor(this.idleLoops / BREATH_LOOPS) % 2 === 1 ? 1 : 0; }
  /** Standing still: the idle loop or one of its variants (where the poncho may sway). */
  get standing() { return this.clip === 'idle' || VARIANTS.includes(this.clip); }
  private pickVariant() {
    const fresh = VARIANTS.filter(name => this.clips[name] && name !== this.lastVariant);
    if (this.wounded && fresh.includes('check-wounds')) return 'check-wounds';
    const calm = fresh.filter(name => name !== 'check-wounds');
    const pool = calm.length ? calm : fresh;
    return pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
  }
  private metadata() { return this.clips[this.clip] ?? this.clips.idle; }
  private set(step: Step) {
    this.clip = step.clip; this.reverse = !!step.reverse;
    this.frame = this.reverse ? this.metadata().frames - 1 : 0;
    this.elapsed = 0; this.finished = false;
  }
  private request(desired: MotionPose) {
    if (!['idle', 'walk', 'run'].includes(desired)) {
      if (this.clip !== desired) { this.queue = []; this.set({ clip: desired }); }
      return;
    }
    if (this.queue.length) return;
    if (VARIANTS.includes(this.clip) && desired === 'idle' && !this.finished) return;
    // A landing gives way to movement once its first pose has shown (a hard landing: its held impact); standing
    // still, it plays out.
    if (this.clip === 'land' && !this.finished && desired === 'idle') return;
    if (this.clip === 'hard-landing' && !this.finished && (desired === 'idle' || this.frame < 1)) return;
    // Out of the air, off a ladder or out of a landing: straight into the cycle the body is in, at its contact
    // pose – never through the standing idle and a run-start while the body is already moving.
    if (!['idle', 'walk', 'run'].includes(this.clip)) {
      this.set({ clip: VARIANTS.includes(this.clip) || !this.clips[desired] ? 'idle' : desired });
      if (this.clip === desired) return;
    }
    if (this.clip === desired) return;
    if (this.clip !== 'idle' && this.frame !== 0 && this.frame !== 4) return;
    const plans: Record<string, Step[]> = {
      'idle:walk': [{ clip: 'idle-walk' }, { clip: 'walk' }],
      'idle:run': [{ clip: 'run-start' }, { clip: 'run' }],
      'walk:run': [{ clip: 'walk-run' }, { clip: 'run' }],
      'walk:idle': [{ clip: 'idle-walk', reverse: true }, { clip: 'idle' }],
      'run:walk': [{ clip: 'walk-run', reverse: true }, { clip: 'walk' }],
      'run:idle': [{ clip: 'walk-run', reverse: true }, { clip: 'idle-walk', reverse: true }, { clip: 'idle' }],
    };
    const plan = plans[`${this.clip}:${desired}`];
    if (plan) { this.queue = [...plan]; this.set(this.queue.shift()!); }
  }
  /** Seconds this frame shows. A cycle with a measured stride advances by distance: one frame per stride/frames px. */
  private duration() {
    const clip = this.metadata();
    if (clip.stride && this.speed > 1) return clip.stride / clip.frames / this.speed;
    const hold = VARIANT_HOLD[this.clip];
    if (hold && !this.reverse && this.frame === hold.frame) return hold.hold;
    return holdFrames(this.clip, this.frame) / clip.fps;
  }
  /** Jump: hold the crouch on the ground frame, then follow the arc; fall: the descent, then the fall loop. */
  private arc(desired: MotionPose, dt: number, air: { vy: number; launch: number }) {
    const relaunch = air.vy < 0 && this.lastVy >= 0; // a pogo bounce or a fresh jump from the fall loop
    this.lastVy = air.vy;
    if (this.clip !== 'jump' && this.clip !== 'fall' || this.clip === 'fall' && relaunch) {
      // Only a jump from the ground shows the crouch; a walk-off or a bounce starts on the arc, and so does a jump
      // out of a landing, whose own crouch was the anticipation.
      const crouched = this.clip === 'land' || this.clip === 'hard-landing';
      this.queue = []; this.set({ clip: 'jump' });
      if (desired !== 'jump' || relaunch && this.wasAirborne || crouched) this.frame = 1;
    } else if (relaunch) this.frame = 1;
    this.wasAirborne = true;
    if (this.clip === 'fall') return null; // the fall loop keeps looping until landing
    // The crouch shows for one rendered frame: the body is already rising, and holding it for a 12 fps frame
    // (5 rendered frames, ~25 px of rise) read as a jump that starts late – the jump-spam complaint.
    const crouch = this.frame === 0 && this.elapsed === 0;
    this.elapsed += Math.min(dt, 0.1);
    if (crouch) return this.pose();
    const frame = arcFrame(air.vy, air.launch, this.metadata().frames);
    if (frame === null) { this.set({ clip: 'fall' }); return null; }
    // Never step backwards along the arc: a jump cut short goes from its own apex straight into the descent.
    this.frame = Math.max(this.frame, frame); this.elapsed = 0;
    return this.pose();
  }
  private advance() {
    const next = this.frame + (this.reverse ? -1 : 1);
    if (next >= 0 && next < this.metadata().frames) { this.frame = next; return; }
    if (this.queue.length) this.set(this.queue.shift()!);
    else if (LOOPS.includes(this.clip) && this.metadata().loop) { this.frame = 0; if (this.clip === 'idle') this.idleLoops++; }
    else if (VARIANT_HOLD[this.clip]?.back && !this.reverse && this.metadata().frames > 1) {
      this.reverse = true; this.frame = this.metadata().frames - 2; // back out to the stand
    } else this.finished = true;
  }
  /**
   * `speed`: the body's horizontal speed in px/s, which paces the strided cycles. `air`: the body's vertical
   * speed and the jump's launch speed; with it, jump and fall follow the arc (see arcFrame).
   */
  update(desired: MotionPose, dt: number, speed = 0, air?: { vy: number; launch: number }) {
    this.speed = speed;
    // A short walk-off (a step between deck plates) keeps the stride instead of flashing the fall pose.
    this.airTime = desired === 'fall' ? this.airTime + Math.min(dt, 0.1) : 0;
    if (desired === 'fall' && this.airTime <= FALL_GRACE && GROUND.includes(this.clip) && !this.wasAirborne
      && (!air || air.vy >= 0)) desired = this.lastGround;
    else if (desired === 'idle' || desired === 'walk' || desired === 'run') this.lastGround = desired;
    if (air && (desired === 'jump' || desired === 'fall') && this.clips.jump) {
      const pose = this.arc(desired, dt, air);
      if (pose) return pose;
    } else if (desired !== 'jump' && desired !== 'fall') { this.lastVy = 0; this.wasAirborne = false; }
    if (desired !== 'idle') this.idleLoops = 0;
    this.idleTime = desired === 'idle' ? this.idleTime + dt : 0;
    this.request(desired);
    // A variant starts where the idle loops (idle-05 → variant-00), never the same one twice running.
    if (this.clip === 'idle' && desired === 'idle' && this.idleTime >= this.variantDelay && this.frame === 0) {
      const pick = this.pickVariant();
      if (pick) { this.set({ clip: pick }); this.lastVariant = pick; }
      this.idleTime = 0; this.variantDelay = this.nextDelay();
    }
    this.elapsed += Math.min(dt, 0.1);
    for (let n = 0; n < 12 && !this.finished && this.elapsed + 1e-9 >= this.duration(); n++) {
      const remainder = Math.max(0, this.elapsed - this.duration());
      this.advance(); this.request(desired); this.elapsed = remainder;
    }
    return this.pose();
  }
  private pose() {
    const metadata = this.metadata();
    return { board: metadata.board, frame: `${metadata.name}-${String((metadata.start ?? 0) + this.frame).padStart(2, '0')}` };
  }
}
