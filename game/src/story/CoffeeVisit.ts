import Phaser from 'phaser';
import { gameEvents, type Position } from '../core/events';
import { VIEW_WIDTH } from '../core/viewport';
import { sound } from '../fx/sound/Audio';
import { pocketMap } from '../ui/mapModel';
import { createAnims, loadAtlases, type AtlasAnim } from './atlases';
import { dexterFor, VisitSequence as Visit, type VisitPhase } from './coffeeSequence';

/** Atlases this scene draws (scripts/export_atlas.py); missing ones fall back to placeholders. */
const ATLASES = ['dexter', 'dexter-acts', 'fx', 'pocket-computer', 'mensa-food'] as const;
const ANIMS: AtlasAnim[] = [
  ['dexter', 'idle', 3, -1], ['dexter-acts', 'sweat', 2, -1], ['dexter-acts', 'absorb', 4, 0],
  ['fx', 'black-fluid', 6, 0], ['pocket-computer', 'bob', 4, -1],
];
const STAGE = 'Stage';
/** Above the stage art and Codex's coffee machine actors (depth 99). */
const DEPTH = 100;
/** Where the gifts land: in front of the hero's feet (stage px). */
const GIFT_ARC = 48;
/** Without a stage (the dev key): a machine and Dexter in the middle of the view, on a ground line. */
const FALLBACK = { machine: { id: 'dev-coffee', x: VIEW_WIDTH / 2 - 20, y: 520, w: 40, h: 80 }, dexter: { x: VIEW_WIDTH / 2 + 30, y: 600 } };

interface Box { id?: string; kind?: string; x: number; y: number; w: number; h: number }
interface Marker { id?: string; kind?: string; x: number; y: number }
/** The part of Codex's stage data (`Stage.create(data)`) this scene reads: world-space boxes and spawns. */
interface StageData { collisions?: { world: { interact: Box[]; spawn: Marker[] } }[] }

interface Station { visit: Visit; dexter: Phaser.GameObjects.Sprite; at: Marker }

/**
 * Dexter at the coffee machine (#52, docs/03 "Region 1 story beats"). When the stage starts, Dexter already
 * sits next to every coffee machine that has a Dexter spawn. The first save there: bow, sweat, the pocket
 * computer and a muffin arc over to the hero, and the menu key unlocks. Every enemy you defeat leaves a pool of
 * black fluid where it fell; at the next save Dexter absorbs each one while you watch. No words.
 */
export class CoffeeVisit extends Phaser.Scene {
  private stations = new Map<string, Station>();
  private pools = new Map<number, Phaser.GameObjects.Sprite>();
  private nextPool = 0;
  private hero: Position = FALLBACK.dexter;
  private host?: Phaser.Scene;

  constructor() { super({ key: 'CoffeeVisit', active: true }); }

  preload(): void {
    loadAtlases(this, ATLASES);
  }

  create(): void {
    const stage = this.scene.get(STAGE);
    stage?.events.on(Phaser.Scenes.Events.CREATE, () => this.seat(stage));
    if (stage && this.scene.isActive(STAGE)) this.seat(stage);
    const stops = [
      gameEvents.on('save', ({ checkpoint, position }) => this.arrive(checkpoint, position)),
      gameEvents.on('enemy-defeated', ({ position }) => this.leavePool(position)),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stops.forEach(stop => stop()));
    // Dev builds: Shift + F4 puts Dexter and a pool in the view and saves at the machine (#52 verification;
    // F4 alone hands over the pocket computer straight away).
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-F4', (event: KeyboardEvent) => {
      if (!event.shiftKey) return;
      if (!this.stations.size) this.seatAt(this, FALLBACK.machine, FALLBACK.dexter);
      const [id, station] = [...this.stations][0];
      if (!this.pools.size) this.leavePool({ x: station.at.x + 90, y: station.at.y });
      this.arrive(id, { x: station.at.x - 70, y: station.at.y });
    });
  }

  update(_time: number, delta: number): void {
    for (const [, station] of this.stations) {
      const before = station.visit.phase;
      const phase = station.visit.update(delta);
      if (phase !== before) this.enter(station, phase);
      if (phase === 'bow') station.dexter.setAngle(Math.sin(station.visit.progress() * Math.PI) * 4);
    }
  }

  /** Dexter sits next to each machine with a Dexter spawn near it, before the hero gets there. */
  private seat(stage: Phaser.Scene): void {
    const data = stage.sys.settings.data as StageData | undefined;
    const worlds = (data?.collisions ?? []).map(chunk => chunk.world);
    const machines = worlds.flatMap(w => w.interact).filter(box => box.kind === 'coffee-machine');
    const spawns = worlds.flatMap(w => w.spawn).filter(spawn => spawn.kind === 'dexter');
    for (const machine of machines) {
      const at = dexterFor(machine, spawns);
      if (at) this.seatAt(stage, machine, at);
    }
  }

  private seatAt(host: Phaser.Scene, machine: Box, at: Marker): void {
    if (this.host !== host) this.clear();
    this.host = host;
    // Another story scene may have loaded a shared atlas after this one started.
    createAnims(this, ANIMS);
    const dexter = this.sprite(host, at.x, at.y, 'dexter', 'idle-00', 0x101010, 10, 27);
    if (this.anims.exists('dexter:idle')) dexter.play('dexter:idle');
    const id = machine.id ?? `coffee-${this.stations.size}`;
    const station: Station = { at, dexter, visit: undefined! };
    station.visit = new Visit({
      onGift: () => this.give(station),
      onAbsorb: pool => this.absorb(station, pool),
    });
    for (const pool of this.pools.keys()) station.visit.addPool(pool);
    this.stations.set(id, station);
  }

  private arrive(checkpoint: string, position: Position): void {
    this.hero = position;
    this.stations.get(checkpoint)?.visit.arrive();
  }

  private enter(station: Station, phase: VisitPhase): void {
    const d = station.dexter;
    d.setAngle(0);
    if (phase === 'bow') this.still(d, 'dexter-acts', 'bow-00');
    else if (phase === 'sweat') this.play(d, 'dexter-acts:sweat');
    else if (phase === 'give') {
      this.still(d, 'dexter-acts', 'beckon-02');
      this.toss(station, 'pocket-computer', 'bob-00', 0, 0x9aa2a8);
      this.toss(station, 'mensa-food', 'muffin-00', 160, 0x6b4a2b);
    } else if (phase === 'absorb') {
      this.play(d, 'dexter-acts:absorb');
      sound.play('fluid-absorb');
    } else if (phase === 'idle') this.play(d, 'dexter:idle');
  }

  /** The gifts leave his paws in an arc and land in front of the hero, then vanish into the inventory. */
  private toss(station: Station, atlas: string, frame: string, delay: number, color: number): void {
    const host = this.host!;
    const from = { x: station.at.x - 8, y: station.at.y - 14 };
    const to = { x: this.hero.x + Math.sign(station.at.x - this.hero.x) * 18, y: this.hero.y };
    const item = this.sprite(host, from.x, from.y, atlas, frame, color, 14, 10);
    host.tweens.addCounter({
      from: 0, to: 1, delay, duration: 520, ease: 'Sine.easeIn',
      onUpdate: tween => {
        const t = tween.getValue() ?? 0;
        item.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * GIFT_ARC);
      },
      onComplete: () => host.tweens.add({ targets: item, alpha: 0, y: item.y - 12, duration: 300, onComplete: () => item.destroy() }),
    });
  }

  private give(_station: Station): void {
    pocketMap.unlock();
  }

  /** A defeated enemy's pool stays where it fell until Dexter absorbs it. */
  private leavePool(position: Position): void {
    const host = this.host ?? this.scene.get(STAGE);
    if (!host) return;
    const id = this.nextPool++;
    const pool = this.sprite(host, position.x, position.y, 'fx', 'black-fluid-05', 0x050608, 22, 4).setDepth(DEPTH - 1);
    if (this.anims.exists('fx:black-fluid')) pool.play('fx:black-fluid');
    this.pools.set(id, pool);
    for (const [, station] of this.stations) station.visit.addPool(id);
  }

  /** The pool thins into strands and is gone; every station forgets it. */
  private absorb(station: Station, id: number): void {
    const pool = this.pools.get(id);
    this.pools.delete(id);
    for (const [, other] of this.stations) {
      const at = other.visit.pools.indexOf(id);
      if (other !== station && at >= 0) other.visit.pools.splice(at, 1);
    }
    if (pool) this.host?.tweens.add({ targets: pool, scaleX: 0, alpha: 0, duration: 600, onComplete: () => pool.destroy() });
  }

  private play(sprite: Phaser.GameObjects.Sprite, key: string): void {
    if (this.anims.exists(key)) sprite.play(key);
  }

  private still(sprite: Phaser.GameObjects.Sprite, atlas: string, frame: string): void {
    if (this.textures.exists(atlas)) sprite.stop().setTexture(atlas, frame);
  }

  /** A sprite from the atlas, or a placeholder rectangle of the measured size when it isn't exported yet. */
  private sprite(host: Phaser.Scene, x: number, y: number, atlas: string, frame: string, color: number, w: number,
    h: number): Phaser.GameObjects.Sprite {
    if (!this.textures.exists(atlas)) {
      const key = `coffee-visit-${color.toString(16)}-${w}x${h}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({}, false).fillStyle(color).fillRect(0, 0, w, h);
        g.generateTexture(key, w, h).destroy();
      }
      return host.add.sprite(x, y, key).setOrigin(0.5, 1).setDepth(DEPTH);
    }
    return host.add.sprite(x, y, atlas, frame).setOrigin(0.5, 1).setDepth(DEPTH);
  }

  private clear(): void {
    for (const [, station] of this.stations) station.dexter.destroy();
    this.stations.clear();
  }
}
