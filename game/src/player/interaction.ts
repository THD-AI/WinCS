import type { AnimationClip } from '../stage/assets';

/** A finite authored clip owns input for exactly its frame count / fps. */
export class Interaction {
  private elapsed = 0;
  private clip: AnimationClip | undefined;
  private name = 'interact';
  get active() { return this.clip !== undefined; }
  /** `name` is the hero-hurt clip whose frames play (default `interact`; the chair uses `pick-up`). */
  begin(clip: AnimationClip, name = 'interact') { this.clip = clip; this.name = name; this.elapsed = 0; }
  cancel() { this.clip = undefined; }
  step(seconds: number) {
    if (!this.clip) return undefined;
    const clip = this.clip;
    const frame = Math.min(clip.frames - 1, Math.floor((this.elapsed + 1e-9) * clip.fps));
    this.elapsed += seconds;
    if (this.elapsed + 1e-9 >= clip.frames / clip.fps) this.cancel();
    return { board: 'hero-hurt', frame: this.name + '-' + String(frame).padStart(2, '0') };
  }
}
