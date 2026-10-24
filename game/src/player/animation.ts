import type { AnimationClip, AnimationTable } from '../stage/assets';
export interface Clip extends AnimationClip { board: string; name: string; start?: number }
export type Catalogue = Record<string, Clip>;
export type MotionPose = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'ladder' | 'land' | 'hard-landing';
const VARIANTS = ['look-around', 'check-tablet', 'check-wounds'];
const LOOPS = ['idle', 'walk', 'run', 'fall', 'ladder'];
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
  constructor(private clips: Catalogue, private random = Math.random) {}
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
    if (['land', 'hard-landing'].includes(this.clip) && !this.finished) return;
    if (!['idle', 'walk', 'run'].includes(this.clip)) this.set({ clip: 'idle' });
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
    return holdFrames(this.clip, this.frame) / clip.fps;
  }
  /** Jump: hold the crouch on the ground frame, then follow the arc; fall: the descent, then the fall loop. */
  private arc(desired: MotionPose, dt: number, air: { vy: number; launch: number }) {
    const relaunch = air.vy < 0 && this.lastVy >= 0; // a pogo bounce or a fresh jump from the fall loop
    this.lastVy = air.vy;
    if (this.clip !== 'jump' && this.clip !== 'fall' || this.clip === 'fall' && relaunch) {
      this.queue = []; this.set({ clip: 'jump' });
      // Only a jump from the ground shows the crouch; a walk-off or a bounce starts on the arc.
      if (desired !== 'jump' || relaunch && this.wasAirborne) this.frame = 1;
    } else if (relaunch) this.frame = 1;
    this.wasAirborne = true;
    if (this.clip === 'fall') return null; // the fall loop keeps looping until landing
    const crouch = this.frame === 0 && this.elapsed + Math.min(dt, 0.1) < 1 / this.metadata().fps;
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
    else if (LOOPS.includes(this.clip) && this.metadata().loop) this.frame = 0;
    else this.finished = true;
  }
  /**
   * `speed`: the body's horizontal speed in px/s, which paces the strided cycles. `air`: the body's vertical
   * speed and the jump's launch speed; with it, jump and fall follow the arc (see arcFrame).
   */
  update(desired: MotionPose, dt: number, speed = 0, air?: { vy: number; launch: number }) {
    this.speed = speed;
    if (air && (desired === 'jump' || desired === 'fall') && this.clips.jump) {
      const pose = this.arc(desired, dt, air);
      if (pose) return pose;
    } else if (desired !== 'jump' && desired !== 'fall') { this.lastVy = 0; this.wasAirborne = false; }
    this.idleTime = desired === 'idle' ? this.idleTime + dt : 0;
    this.request(desired);
    if (this.clip === 'idle' && desired === 'idle' && this.idleTime >= 5) {
      const available = VARIANTS.filter(name => this.clips[name]);
      if (available.length) this.set({ clip: available[Math.min(available.length - 1, Math.floor(this.random() * available.length))] });
      this.idleTime = 0;
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
