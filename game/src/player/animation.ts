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
  const jump = clips.jump;
  clips.land = jump ? { ...jump, start: jump.frames - 1, frames: 1, fps: 6, loop: false }
    : { ...clips.idle, frames: 1, fps: 6, loop: false };
  return clips;
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
    const hold = this.clip === 'jump' && this.frame === 0 || this.clip === 'hard-landing' && this.frame === 0;
    return (hold ? 2 : 1) / Math.min(12, clip.fps);
  }
  private advance() {
    const next = this.frame + (this.reverse ? -1 : 1);
    if (next >= 0 && next < this.metadata().frames) { this.frame = next; return; }
    if (this.queue.length) this.set(this.queue.shift()!);
    else if (LOOPS.includes(this.clip) && this.metadata().loop) this.frame = 0;
    else this.finished = true;
  }
  /** `speed`: the body's horizontal speed in px/s, which paces the strided cycles. */
  update(desired: MotionPose, dt: number, speed = 0) {
    this.speed = speed;
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
    const metadata = this.metadata();
    return { board: metadata.board, frame: `${metadata.name}-${String((metadata.start ?? 0) + this.frame).padStart(2, '0')}` };
  }
}
