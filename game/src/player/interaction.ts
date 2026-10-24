import type { AnimationClip } from '../stage/assets';

/** A finite authored clip owns input for exactly its frame count / fps. */
export class Interaction {
  private elapsed = 0;
  private clip: AnimationClip | undefined;
  get active() { return this.clip !== undefined; }
  begin(clip: AnimationClip) { this.clip = clip; this.elapsed = 0; }
  cancel() { this.clip = undefined; }
  step(seconds: number) {
    if (!this.clip) return undefined;
    const clip = this.clip;
    const frame = Math.min(clip.frames - 1, Math.floor((this.elapsed + 1e-9) * clip.fps));
    this.elapsed += seconds;
    if (this.elapsed + 1e-9 >= clip.frames / clip.fps) this.cancel();
    return { board: 'hero-hurt', frame: 'interact-' + String(frame).padStart(2, '0') };
  }
}
