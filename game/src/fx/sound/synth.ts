import { Voice } from './recipes';

/** Plays recipes on a Web Audio context: one short-lived node chain per voice, nothing loaded from files. */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise per context, reused by every noise voice. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Schedules `voices` to start at context time `when`, into `out`. */
export function playVoices(ctx: BaseAudioContext, out: AudioNode, voices: Voice[], when = ctx.currentTime): void {
  for (const v of voices) {
    const t0 = when + (v.start ?? 0);
    const t1 = t0 + v.dur;
    const attack = Math.min(v.attack ?? 0.005, v.dur / 2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(v.gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    let source: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx);
      noise.loop = true;
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.from ?? 440, t0);
      if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, t1);
      source = osc;
    }
    let head: AudioNode = source;
    if (v.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = v.filter.type;
      filter.Q.value = v.filter.q ?? 1;
      filter.frequency.setValueAtTime(v.filter.from, t0);
      if (v.filter.to) filter.frequency.exponentialRampToValueAtTime(v.filter.to, t1);
      head.connect(filter);
      head = filter;
    }
    head.connect(env).connect(out);
    source.start(t0);
    source.stop(t1 + 0.02);
  }
}
