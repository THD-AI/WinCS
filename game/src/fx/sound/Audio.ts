import Phaser from 'phaser';
import { gameEvents } from '../../core/events';
import { LOOPS, LoopId, LoopState, loopVoices, regionLoop } from './loops';
import { RECIPES, SoundId } from './recipes';
import { noiseBuffer, playVoices } from './synth';

const MASTER = 0.6;
/** Bars are scheduled this far ahead of the audio clock, so a slow frame never gaps the loop. */
const LOOKAHEAD = 0.5;

let active: Audio | undefined;

/**
 * Game code plays effects through this, e.g. `sound.play('chair-whoosh')` (lane B: footsteps, swings, motors).
 * Calls before the first input – when browsers keep audio locked – are silently dropped.
 */
export const sound = {
  play(id: SoundId): void { active?.play(id); },
  loop(id: LoopId | null): void { active?.setLoop(id); },
  /** For debugging: whether audio is unlocked, which loop plays and how many bars it has scheduled. */
  state(): { context: AudioContextState | 'none'; loop: LoopId | null; bars: number } {
    return { context: active?.ctx?.state ?? 'none', loop: active?.loopId ?? null, bars: active?.bar ?? 0 };
  },
};

/**
 * The sound of the slice (#71): synthesized effects and loops, no audio files. Listens to the game events
 * for hits, defeats, the boss and region turns; M mutes.
 */
export class Audio extends Phaser.Scene {
  ctx?: AudioContext;
  private master?: GainNode;
  private loopBus?: GainNode;
  private bed?: { source: AudioBufferSourceNode; gain: GainNode };
  loopId: LoopId | null = null;
  private loopState: LoopState = 'clean';
  bar = 0;
  private nextBarAt = 0;

  constructor() { super({ key: 'Audio', active: true }); }

  create(): void {
    const manager = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (!('context' in manager)) return; // no Web Audio: the game stays silent rather than failing
    this.ctx = manager.context;
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(manager.destination);
    this.loopBus = this.ctx.createGain();
    this.loopBus.connect(this.master);
    active = this;

    const offs = [
      gameEvents.on('player-hit', () => this.play('player-hurt')),
      gameEvents.on('enemy-defeated', () => this.play('enemy-defeated')),
      gameEvents.on('boss-defeated', () => { this.play('jenny-crash'); this.setLoop(null); }),
      gameEvents.on('region-turned', ({ region, state }) => { this.loopState = state; this.setLoop(regionLoop(region)); }),
    ];
    this.input.keyboard?.on('keydown-M', () => manager.setMute(!manager.mute));
    // Dev builds: F6 steps through the loops, F7 through the effects – for listening with headphones (#71).
    if (import.meta.env.DEV) {
      const effects = Object.keys(RECIPES) as SoundId[];
      const loops: (LoopId | null)[] = [...(Object.keys(LOOPS) as LoopId[]), null];
      let effect = 0;
      let loop = 0;
      this.input.keyboard?.on('keydown-F7', () => {
        const id = effects[effect++ % effects.length];
        console.info(`[sound] ${id}`);
        this.play(id);
      });
      this.input.keyboard?.on('keydown-F6', () => {
        const id = loops[loop++ % loops.length];
        console.info(`[sound] loop ${id ?? 'off'}`);
        this.setLoop(id);
      });
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offs.forEach((off) => off());
      this.setLoop(null);
      if (active === this) active = undefined;
    });
  }

  play(id: SoundId): void {
    if (this.ctx && this.master && this.ctx.state === 'running') playVoices(this.ctx, this.master, RECIPES[id]);
  }

  /** Switches the background loop; null stops it. The same loop keeps playing (only its state may change). */
  setLoop(id: LoopId | null): void {
    if (id === this.loopId) return;
    this.bed?.source.stop();
    this.bed = undefined;
    this.loopId = id;
    this.bar = 0;
    this.nextBarAt = 0;
    const loop = id && LOOPS[id];
    if (!loop?.bed || !this.ctx || !this.loopBus) return;
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer(this.ctx);
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = loop.bed.type;
    filter.frequency.value = loop.bed.freq;
    filter.Q.value = loop.bed.q ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = loop.bed.gain;
    source.connect(filter).connect(gain).connect(this.loopBus);
    source.start();
    this.bed = { source, gain };
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.loopBus || !this.loopId || ctx.state !== 'running') return;
    const loop = LOOPS[this.loopId];
    if (this.nextBarAt < ctx.currentTime) this.nextBarAt = ctx.currentTime + 0.05;
    while (this.nextBarAt < ctx.currentTime + LOOKAHEAD) {
      playVoices(ctx, this.loopBus, loopVoices(this.loopId, this.bar, this.loopState), this.nextBarAt);
      this.bar++;
      this.nextBarAt += loop.bar;
    }
  }
}
