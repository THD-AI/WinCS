import Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { Player } from '../player/player';
import type { Box, CollisionChunk, Marker } from '../stage/collision';
import { createAnims, type AtlasAnim } from './atlases';
import type { CrossingHero } from './Crossing';
import { FINALE, FinaleSequence, knockArc, type FinalePhase } from './prologueFinale';
import { DexterGuide, stopsFrom, type GuideAnim, type Pt } from './prologueGuide';

const ANIMS: AtlasAnim[] = [
  ['dexter', 'idle', 3, -1], ['dexter', 'hop', 4, -1], ['dexter', 'walk', 6, -1], ['dexter', 'point', 3, 0],
  ['dexter', 'shove', 4, 0], ['dexter-acts', 'beckon', 3, -1], ['hero-hurt', 'knockback', 3, 0],
];
/** Each pose and its stand-in from the approved boards while `dexter-prologue` awaits review. */
const ANIM_KEY: Record<GuideAnim, [string, string]> = {
  sit: ['dexter-prologue:sit', 'dexter:idle'], look: ['dexter-prologue:look-back', 'dexter:idle'],
  wait: ['dexter-prologue:wait', 'dexter:idle'], hop: ['dexter:hop', 'dexter:hop'], walk: ['dexter:walk', 'dexter:walk'],
  point: ['dexter:point', 'dexter:point'], beckon: ['dexter-acts:beckon', 'dexter-acts:beckon'],
};
/** A 1 px warm rim so the black plush reads against the dark hedge path (#159). */
const RIM = { color: 0xffc98a, outer: 1.4, distance: 2 };
/** NPCs draw at 101–105 (docs/15 depth bands); secrets sit with the props at 99. */
const DEXTER_DEPTH = 101;
const PROP_DEPTH = 99;
/** The muffin shows itself when the hero is this close (px), and is taken at arm's length. */
const REVEAL_NEAR = 200;
const TAKE_NEAR = 26;
/** Shown only until the water renderer draws the wrong reflection itself (workstream 2). */
const FALLBACK_REFLECTION = true;

type StageScene = Phaser.Scene & { playerActor?: Player };

/** Animations from an atlas's own table (frames, fps, loop), as exported by export_atlas.py. */
function createTableAnims(scene: Phaser.Scene, atlas: string): void {
  const table = scene.cache.json.get(`${atlas}.anims`) as Record<string, { frames: number; fps: number; loop: boolean }> | undefined;
  if (!table || !scene.textures.exists(atlas)) return;
  for (const [anim, clip] of Object.entries(table)) {
    const key = `${atlas}:${anim}`;
    if (scene.anims.exists(key)) continue;
    const frames = Array.from({ length: clip.frames }, (_, i) => ({ key: atlas, frame: `${anim}-${String(i).padStart(2, '0')}` }));
    scene.anims.create({ key, frames, frameRate: clip.fps, repeat: clip.loop ? -1 : 0 });
  }
}

/** Flow's hand-off for the crash: the 404 crossing with the hero frozen in his knock pose. */
export type Crash404 = (hero: CrossingHero, onLand: () => void) => void;

/**
 * The Hidden Garden prologue drawn into the stage (docs/03 "Prologue", #50 #51 #160): Dexter on the bench, his
 * lead along the waypoints, the two secrets (the muffin in the hollow, the glint on the shed roof), and the
 * pond finale – the wrong reflection, the shove, then the 404 crossing that pulls the hero into Rusty Creek.
 * Everything comes from the region's collision data: `dexter-bench`, the `dexter-waypoint` boxes and their
 * `act`, the `secret` box with its item, the roof glint, and the `anomaly` box at the jetty edge.
 */
export class Prologue {
  readonly guide: DexterGuide;
  readonly finale: FinaleSequence;
  private dexter: Phaser.GameObjects.Sprite;
  private anim = '';
  private pondEdge?: Box;
  private proxy?: Phaser.GameObjects.Sprite;
  private knockFrom: Position = { x: 0, y: 0 };
  private lastPhase: FinalePhase = 'idle';
  private reflection?: Phaser.GameObjects.Graphics;
  private secrets: { sprite: Phaser.GameObjects.GameObject & { x: number; y: number }; at: Marker; shown: boolean; taken: boolean; kind: 'muffin' | 'glint' }[] = [];
  private stops: (() => void)[] = [];

  constructor(private readonly stage: StageScene, chunks: CollisionChunk[], private readonly region: string,
    private readonly crash: Crash404) {
    const worlds = chunks.map(c => c.world);
    const lines: Pt[][] = worlds.flatMap(w => [...w.walk, ...w.oneWay]);
    const boxes = worlds.flatMap(w => w.interact);
    const spawns = worlds.flatMap(w => w.spawn);
    const bench = spawns.find(s => s.id === 'dexter-bench') ?? spawns.find(s => s.kind === 'dexter')!;
    this.guide = new DexterGuide({ bench, lines, ...stopsFrom(boxes) });
    this.pondEdge = boxes.find(b => b.kind === 'anomaly');
    this.finale = new FinaleSequence(() => this.toCrash());
    createAnims(stage, ANIMS);
    createTableAnims(stage, 'dexter-prologue');
    this.dexter = stage.add.sprite(bench.x, bench.y, 'dexter', 'idle-00').setOrigin(0.5, 1).setDepth(DEXTER_DEPTH);
    this.dexter.preFX?.setPadding(RIM.distance + 1);
    this.dexter.preFX?.addGlow(RIM.color, RIM.outer, 0, false, 0.1, RIM.distance);
    this.placeSecrets(boxes, spawns);
    const update = (_time: number, delta: number) => this.update(delta);
    stage.events.on(Phaser.Scenes.Events.UPDATE, update);
    this.stops.push(() => stage.events.off(Phaser.Scenes.Events.UPDATE, update));
    stage.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Prologue exists where the region has Dexter's bench. */
  static fits(chunks: CollisionChunk[]): boolean {
    return chunks.some(c => c.world.spawn.some(s => s.id === 'dexter-bench'));
  }

  get running(): boolean { return this.finale.phase !== 'idle'; }

  /** Dev: put the hero and Dexter at the jetty, ready for the finale. */
  skipToPond(): void {
    const player = this.stage.playerActor;
    this.guide.placeAt(Number.MAX_SAFE_INTEGER);
    if (player && this.pondEdge) Object.assign(player.body, { x: this.pondEdge.x - 140, y: this.pondEdge.y + this.pondEdge.h, vx: 0, vy: 0 });
  }

  private update(delta: number): void {
    const player = this.stage.playerActor;
    if (!player) return;
    const hero = player.body;
    if (this.finale.phase === 'idle') {
      this.draw(this.guide.update(delta, hero));
      this.updateSecrets(player);
      const edge = this.pondEdge;
      if (edge && this.guide.state === 'at-pond' && hero.x >= edge.x && hero.grounded && player.life.dead === 0) this.beginFinale(player);
      return;
    }
    const phase = this.finale.update(delta);
    const t = this.finale.progress();
    const entered = phase !== this.lastPhase;
    this.lastPhase = phase;
    if (phase === 'reveal') this.flickerReflection(t);
    if (phase === 'step') {
      if (entered) { this.reflection?.setAlpha(0.55); this.play('dexter:walk'); }
      const from = this.guide.x;
      const to = hero.x - FINALE.behind;
      this.dexter.setPosition(Math.round(from + (to - from) * t), Math.round(hero.y)).setFlipX(false);
    }
    if (phase === 'shove') {
      if (entered) this.play('dexter:shove');
      if (!this.proxy && t * FINALE.shove >= (FINALE.contactFrame * 1000) / 12) this.knock(player);
    }
    if (phase === 'fall') {
      if (entered) {
        if (!this.proxy) this.knock(player);
        // One frame of what he really is, while nobody is looking at him.
        this.dexter.stop().setTexture('dexter-acts', 'creepy-00');
      }
      const p = knockArc(this.knockFrom, t);
      this.proxy?.setPosition(Math.round(p.x), Math.round(p.y)).setAngle(p.angle);
    }
  }

  private draw(view: ReturnType<DexterGuide['update']>): void {
    this.dexter.setPosition(Math.round(view.x), Math.round(view.y)).setFlipX(view.facing < 0);
    const [key, standIn] = ANIM_KEY[view.anim];
    this.play(this.stage.anims.exists(key) ? key : standIn);
  }

  private play(key: string): void {
    if (key === this.anim || !this.stage.anims.exists(key)) return;
    this.anim = key;
    this.dexter.play(key);
  }

  /** The hero reached the jetty edge with Dexter behind him: control is taken and the water goes wrong. */
  private beginFinale(player: Player): void {
    if (!this.finale.start()) return;
    this.lastPhase = 'reveal';
    const keyboard = this.stage.input.keyboard;
    keyboard?.resetKeys();
    if (keyboard) keyboard.enabled = false;
    if (this.stage.input.gamepad) this.stage.input.gamepad.enabled = false;
    this.play('dexter:point');
    const edge = this.pondEdge!;
    const water = { x: Math.round(player.body.x + 50), y: edge.y + edge.h + 18 };
    gameEvents.emit('anomaly-reveal', { id: edge.id ?? 'pond-edge', region: this.region, position: water, duration: FINALE.reveal });
    if (FALLBACK_REFLECTION) this.reflection = this.drawWrongReflection(water);
  }

  /** The shove connects: the stage hero hides and a stand-in is knocked out over the water. */
  private knock(player: Player): void {
    sound.play('player-hurt');
    this.knockFrom = { x: player.body.x, y: player.body.y };
    player.sprite.setVisible(false);
    this.proxy = this.stage.add.sprite(player.body.x, player.body.y, 'hero-hurt', 'knockback-00').setOrigin(0.5, 1)
      .setDepth(100).setFlipX(false);
    if (this.stage.anims.exists('hero-hurt:knockback')) this.proxy.play('hero-hurt:knockback');
  }

  /** Hand over to the 404 crossing at the hero's view position; on its cut the region swaps. */
  private toCrash(): void {
    const proxy = this.proxy;
    const cam = this.stage.cameras.main;
    const at = proxy ? { x: proxy.x, y: proxy.y } : this.knockFrom;
    const hero: CrossingHero = {
      x: (at.x - cam.worldView.x) * cam.zoom, y: (at.y - cam.worldView.y) * cam.zoom,
      texture: proxy?.texture.key ?? 'hero-hurt', frame: String(proxy?.frame.name ?? 'knockback-02'), angle: proxy?.angle ?? 0,
    };
    this.crash(hero, () => this.release());
    // The crossing draws the hero from here on.
    this.proxy?.setVisible(false);
  }

  /** Give the input back (the stage restarts with the new region, the plugin outlives it). */
  private release(): void {
    const keyboard = this.stage.input.keyboard;
    if (keyboard) keyboard.enabled = true;
    if (this.stage.input.gamepad) this.stage.input.gamepad.enabled = true;
  }

  /**
   * Until the water renderer reacts to `anomaly-reveal`: a patch of rusty girders flickers into the water under
   * the jetty, upside down like a reflection – the maze that isn't there (docs/03).
   */
  private drawWrongReflection(at: Position): Phaser.GameObjects.Graphics {
    const g = this.stage.add.graphics({ x: at.x, y: at.y }).setDepth(PROP_DEPTH + 0.5).setAlpha(0);
    const w = 120;
    const h = 46;
    g.fillStyle(0x3a2014, 0.55).fillRect(-w / 2, 0, w, h);
    g.lineStyle(4, 0x8a4a2a, 1).lineBetween(-w / 2, 6, w / 2, 6).lineBetween(-w / 2, h - 6, w / 2, h - 6);
    g.lineStyle(3, 0x6e3a20, 1);
    for (let x = -w / 2; x < w / 2; x += 30) g.lineBetween(x, 6, x + 30, h - 6).lineBetween(x + 30, 6, x, h - 6);
    g.lineStyle(2, 0xb06a3a, 0.8);
    for (let x = -w / 2; x <= w / 2; x += 30) g.lineBetween(x, 6, x, h - 6);
    return g;
  }

  private flickerReflection(t: number): void {
    // Glimpses at first, then it stays: you can't unsee it.
    const on = t > 0.6 || Math.random() < t * 0.6;
    this.reflection?.setAlpha(on ? 0.35 + 0.3 * t : 0);
  }

  /** The muffin in the hollow behind the grass, and the glint on the shed roof (docs/04, #50). */
  private placeSecrets(boxes: Box[], spawns: Marker[]): void {
    const muffinAt = spawns.find(s => s.kind === 'item' && boxes.some(b => b.kind === 'secret' && s.x >= b.x && s.x <= b.x + b.w));
    if (muffinAt) {
      const has = this.stage.textures.exists('mensa-food');
      const sprite = (has ? this.stage.add.sprite(muffinAt.x, muffinAt.y, 'mensa-food', 'muffin-00')
        : this.stage.add.rectangle(muffinAt.x, muffinAt.y, 14, 10, 0x6b4a2b)).setOrigin(0.5, 1).setDepth(PROP_DEPTH).setAlpha(0);
      this.secrets.push({ sprite, at: muffinAt, shown: false, taken: false, kind: 'muffin' });
    }
    const glintAt = spawns.find(s => s.kind === 'item' && /glint/.test(s.id ?? ''));
    if (glintAt) {
      const g = this.stage.add.graphics({ x: glintAt.x, y: glintAt.y - 8 }).setDepth(PROP_DEPTH);
      g.fillStyle(0xfff6d8, 1).fillTriangle(-2, 0, 2, 0, 0, -9).fillTriangle(-2, 0, 2, 0, 0, 9)
        .fillTriangle(0, -2, 0, 2, -9, 0).fillTriangle(0, -2, 0, 2, 9, 0).fillRect(-2, -2, 4, 4);
      this.stage.tweens.add({ targets: g, scale: { from: 0.4, to: 1.15 }, alpha: { from: 0.35, to: 1 }, duration: 520,
        yoyo: true, repeat: -1, repeatDelay: 900, ease: 'Sine.easeInOut' });
      this.secrets.push({ sprite: g, at: glintAt, shown: true, taken: false, kind: 'glint' });
    }
  }

  private updateSecrets(player: Player): void {
    const hero = player.body;
    for (const secret of this.secrets) {
      if (secret.taken) continue;
      const dx = Math.abs(hero.x - secret.at.x);
      const dy = Math.abs(hero.y - secret.at.y);
      if (!secret.shown && dx < REVEAL_NEAR && dy < 40) {
        secret.shown = true;
        this.stage.tweens.add({ targets: secret.sprite, alpha: 1, duration: 600 });
        this.stage.tweens.add({ targets: secret.sprite, y: secret.at.y - 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      if (secret.shown && dx < TAKE_NEAR && dy < 30) this.take(secret, player);
    }
  }

  private take(secret: Prologue['secrets'][number], player: Player): void {
    secret.taken = true;
    const sprite = secret.sprite;
    this.stage.tweens.killTweensOf(sprite);
    if (secret.kind === 'muffin') player.heal(1);
    this.stage.tweens.add({ targets: sprite, y: secret.at.y - 46, alpha: 0, scale: 1.6, duration: 520, ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy() });
  }

  private destroy(): void {
    this.release();
    for (const stop of this.stops) stop();
    this.stops = [];
  }
}
