import Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { ChairCombat } from '../combat/chair';
import { intersects } from '../combat/sweeps';
import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import type { Player } from '../player/player';
import type { AnimationTable } from '../stage/assets';
import { ACTOR_RIM, addRim } from '../stage/atmosphere/pipeline';
import type { Box, CollisionChunk } from '../stage/collision';
import { arenaFrom, blinking, JENNY_BOX, JENNY_HEALTH, JennyFight, PART_DAMAGE, STUN_WARNING, type JennyPhase, type Part } from './jenny';

const ID = 'jenny';
const NAME = 'Jenny';
const DEPTH = 101;
/** Her charge throws the hero up and along her travel (px/s): he flies over the hood instead of her driving through. */
export const THROW_UP = 520;
/** Camera shake per event (ms, intensity): her charge hitting the hero, a chair hit landing, the armoured nose. */
const SHAKE = { ram: [220, 0.01], hit: [90, 0.004], clank: [60, 0.002], crash: [260, 0.012], final: [320, 0.014] } as const;
/** A landed chair hit rocks her this far (px) the way the chair swung, easing back over `RECOIL_SECONDS`. */
export const RECOIL_PX = 4, RECOIL_SECONDS = 0.12;
/** The arena's second wall (px wide, px tall above the floor): the far end of her floor, closed while she fights. */
export const FAR_WALL = { w: 30, h: 300 };
type Hud = Phaser.Scene & { model?: { showBoss(name: string, max: number): void; setBossHealth(h: number): void; hideBoss(): void } };

/**
 * Where her charge sends the hero (P8): the knock source sits behind him relative to her travel, so he is thrown
 * the way she drives – never back through her – and up over the hood. Pure, so it is unit-tested.
 */
export function ramKnock(heroX: number, facing: -1 | 1): { sourceX: number; vy: number } {
  return { sourceX: heroX - facing * BODY_WIDTH, vy: -THROW_UP };
}

/**
 * Draws and wires Jenny's fight (#57, P8) into the stage. Everything comes from the region's collision: her `jenny`
 * spawn, the `boss-gate` box that closes behind you, and the floor she drives on. Walking through the gate starts
 * the fight and the boss bar; beating her emits `boss-defeated`, which the Ending scene turns into the end of the
 * slice. Dying resets the fight. What reads: the rev shakes and smokes with the lights on (the tell); her charge
 * throws you and she brakes; her open back glows, and while she is stunned a hazard light blinks over it; every
 * chair hit flashes, shakes and sparks; the armoured nose clanks you back; shed parts bounce and lie as hazards.
 */
export class JennyBoss {
  private fight?: JennyFight;
  private sprite?: Phaser.GameObjects.Sprite;
  private glow?: Phaser.GameObjects.Ellipse;
  private hazard?: Phaser.GameObjects.Ellipse;
  private lamp?: Phaser.GameObjects.Ellipse;
  private parts = new Map<Part, Phaser.GameObjects.Sprite>();
  private hurt = new Set<Part>();
  private wall?: { box: Box; far: Box; list: Box[] };
  private last: JennyPhase = 'waiting';
  private recoil = 0;
  private recoilDir = 0;
  private gate?: Box;
  private flash = 0;
  private puff = 0;
  private cleanup: (() => void)[] = [];

  constructor(private scene: Phaser.Scene, private player: Player, private chair: ChairCombat, chunks: CollisionChunk[]) {
    const spawn = chunks.flatMap(c => c.world.spawn).find(s => s.kind === 'jenny');
    const gateChunk = chunks.find(c => c.world.interact.some(b => b.kind === 'boss-gate'));
    this.gate = gateChunk?.world.interact.find(b => b.kind === 'boss-gate');
    if (!spawn || !this.gate || !gateChunk || player.life.defeatedBosses.has(ID)) return;
    const clips = { ...scene.cache.json.get('boss-jenny.anims'), ...scene.cache.json.get('boss-jenny-2.anims') } as AnimationTable;
    const walk = chunks.flatMap(c => c.world.walk);
    this.fight = new JennyFight(arenaFrom(this.gate, spawn, walk), spawn.x, clips);
    const arena = this.fight.arena;
    this.wall = { box: { id: 'boss-wall', kind: 'boss-wall', x: this.gate.x, y: this.gate.y - 200, w: this.gate.w, h: this.gate.h + 200 },
      // The far end: her ram throws the hero the way she drives, and he must land in the arena, not on the path beyond.
      far: { id: 'boss-wall-far', kind: 'boss-wall', x: arena.right, y: arena.floor - FAR_WALL.h, w: FAR_WALL.w, h: FAR_WALL.h },
      list: gateChunk.world.solid };
    // The open back's glow sits under the car; the hazard light and the headlight over it.
    this.glow = scene.add.ellipse(spawn.x, spawn.y, 48, 40, 0xff9a3c, 0).setDepth(DEPTH - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.sprite(spawn.x, spawn.y, 'boss-jenny', 'rev-00').setOrigin(0.5, 1).setDepth(DEPTH);
    addRim(this.sprite, ACTOR_RIM.colour, ACTOR_RIM.strength);
    this.hazard = scene.add.ellipse(spawn.x, spawn.y, 14, 14, 0xffb020, 0).setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.lamp = scene.add.ellipse(spawn.x, spawn.y, 22, 12, 0xfff4cb, 0).setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.cleanup.push(
      chair.register({ id: ID, active: () => !!this.fight && this.fight.active && this.fight.health > 0,
        bounds: () => this.fight!.bounds, hit: hit => this.hit(hit.damage, hit.direction) }),
      player.life.register(ID, () => this.reset(), true),
      gameEvents.on('trigger-entered', ({ kind }) => { if (kind === 'boss-gate') this.start(); }),
    );
    scene.events.once('shutdown', () => this.cleanup.forEach(off => off()));
  }

  private get hud(): Hud | undefined { return this.scene.scene.get('HUD') as Hud | undefined; }

  private start(): void {
    const fight = this.fight;
    if (!fight || fight.phase !== 'waiting') return;
    // Only once the hero is fully inside the arena, so the wall never lands on them.
    if (this.player.body.x - BODY_WIDTH / 2 <= this.gate!.x + this.gate!.w) {
      this.scene.time.delayedCall(250, () => this.start());
      return;
    }
    fight.start();
    const wall = this.wall!;
    if (!wall.list.includes(wall.box)) wall.list.push(wall.box);
    if (!wall.list.includes(wall.far) && this.player.body.x < wall.far.x) wall.list.push(wall.far);
    this.hud?.model?.showBoss(NAME, JENNY_HEALTH);
  }

  private hit(damage: number, direction: number): boolean {
    const fight = this.fight!;
    const landed = fight.hit(damage, direction);
    const camera = this.scene.cameras.main;
    if (landed) {
      this.flash = 0.08;
      this.recoil = RECOIL_SECONDS; this.recoilDir = Math.sign(direction);
      this.hud?.model?.setBossHealth(fight.health);
      const shake = fight.health === 0 ? SHAKE.final : SHAKE.hit;
      camera.shake(shake[0], shake[1]);
      const at = fight.open === 'back' ? fight.tailX : this.player.body.x + direction * 30;
      this.sparks(at, 0xffc35a, 10);
      // Bits of carbon and bodywork chip off the way the chair swung.
      this.debris(at, Math.sign(direction) || 1, fight.health === 0 ? 10 : 4);
    } else {
      // The armoured nose: a dull clank, grey sparks, and the chair bounces the hero back.
      sound.play('chair-hit');
      camera.shake(SHAKE.clank[0], SHAKE.clank[1]);
      this.sparks(fight.x + fight.facing * JENNY_BOX.w / 2, 0xb8c2c8, 5);
      this.player.pushGuard(-Math.sign(direction) || -1);
    }
    return landed;
  }

  private sparks(x: number, colour: number, count: number): void {
    const y = this.fight!.arena.floor - JENNY_BOX.h / 2;
    for (let i = 0; i < count; i++) {
      const pixel = this.scene.add.rectangle(x, y, 3, 3, colour).setDepth(DEPTH + 2);
      const angle = (i / count) * Math.PI * 2;
      this.scene.tweens.add({ targets: pixel, x: x + Math.cos(angle) * 26, y: y + Math.sin(angle) * 20 - 8,
        alpha: 0, duration: 200, onComplete: () => pixel.destroy() });
    }
  }

  /** Dark chips that fly off and fall to the floor: the hit took something off her. */
  private debris(x: number, direction: number, count: number): void {
    const floor = this.fight!.arena.floor, y = floor - JENNY_BOX.h / 2;
    for (let i = 0; i < count; i++) {
      const chip = this.scene.add.rectangle(x, y - 6 + (i % 3) * 6, 3 + (i % 2), 2 + (i % 2), i % 3 ? 0x23282c : 0x6fd63a)
        .setDepth(DEPTH + 2);
      this.scene.tweens.add({ targets: chip, x: x + direction * (14 + ((i * 37) % 30)), duration: 360, ease: 'Quad.easeOut' });
      this.scene.tweens.add({ targets: chip, y: floor - 1, duration: 360, ease: 'Back.easeIn',
        onComplete: () => this.scene.tweens.add({ targets: chip, alpha: 0, delay: 250, duration: 200, onComplete: () => chip.destroy() }) });
    }
  }

  /** She meets the wall: the crash sound, a heavy shake and a burst of smoke at her nose. */
  private crashed(fight: JennyFight): void {
    sound.play('jenny-crash');
    this.scene.cameras.main.shake(SHAKE.crash[0], SHAKE.crash[1]);
    const noseX = fight.x + fight.facing * JENNY_BOX.w / 2, floor = fight.arena.floor;
    for (let i = 0; i < 6; i++) {
      const puff = this.scene.add.circle(noseX, floor - 10 - i * 6, 7, 0x9aa3a8, 0.75).setDepth(DEPTH + 1);
      this.scene.tweens.add({ targets: puff, x: noseX - fight.facing * (10 + i * 8), y: puff.y - 20 - i * 4, scale: 2.6, alpha: 0,
        duration: 520, onComplete: () => puff.destroy() });
    }
  }

  private reset(): void {
    this.fight?.reset();
    this.openWall();
    for (const s of this.parts.values()) s.destroy();
    this.parts.clear(); this.hurt.clear(); this.last = this.fight?.phase ?? 'waiting'; this.recoil = 0;
    if (this.fight?.phase === 'waiting') this.hud?.model?.hideBoss();
  }

  private openWall(): void {
    if (!this.wall) return;
    for (const box of [this.wall.box, this.wall.far]) {
      const i = this.wall.list.indexOf(box);
      if (i >= 0) this.wall.list.splice(i, 1);
    }
  }

  update(milliseconds: number): void {
    const fight = this.fight, sprite = this.sprite;
    if (!fight || !sprite) return;
    if (fight.step(milliseconds / 1000)) {
      this.openWall();
      gameEvents.emit('boss-defeated', { id: ID, position: { x: fight.x, y: fight.arena.floor } });
    }
    if (fight.phase !== this.last) {
      if (fight.phase === 'crash') this.crashed(fight);
      // Reboot: green sparks over the car – she is about to go again (docs/05).
      if (fight.phase === 'reboot') this.sparks(fight.x, 0x7dff6a, 12);
      this.last = fight.phase;
    }
    const { atlas, name } = fight.frame;
    if (this.scene.textures.get(atlas).has(name)) sprite.setTexture(atlas, name);
    this.recoil = Math.max(0, this.recoil - milliseconds / 1000);
    const recoil = Math.round(this.recoilDir * RECOIL_PX * (this.recoil / RECOIL_SECONDS));
    // The approved frames face left (nose left), so a right-facing Jenny is mirrored. The rev shakes her (the tell).
    sprite.setPosition(Math.round(fight.x + fight.shake) + recoil, fight.arena.floor + (fight.phase === 'rev' ? Math.abs(fight.shake) % 2 : 0))
      .setFlipX(fight.facing > 0)
      .setVisible(fight.phase !== 'gone').setAlpha(fight.phase === 'stall' ? 0.6 + 0.4 * Math.random() : 1);
    this.flash = Math.max(0, this.flash - milliseconds / 1000);
    if (this.flash > 0) sprite.setTintFill(0xffffff); else sprite.clearTint();
    this.drawTells(fight, milliseconds);
    this.drawParts(fight);
    this.contact(fight);
  }

  /** The rev's lights and exhaust; the open back's glow; the stunned hazard light. */
  private drawTells(fight: JennyFight, milliseconds: number): void {
    const now = this.scene.time.now, floor = fight.arena.floor;
    const pulse = 0.5 + 0.5 * Math.sin(now / 120);
    const open = fight.open;
    // The open back: faint while she drives (hit her from behind), bright and pulsing while she is stunned.
    this.glow!.setPosition(fight.tailX + fight.facing * 22, floor - JENNY_BOX.h / 2)
      .setFillStyle(0xff9a3c, open === 'all' ? 0.35 + 0.35 * pulse : open === 'back' ? 0.12 : 0).setScale(open === 'all' ? 1 + 0.2 * pulse : 1);
    // The hazard light blinks while she is stunned, twice as fast in the last moments before she reboots.
    const blink = fight.stunLeft > 0 && fight.stunLeft < STUN_WARNING ? 100 : 200;
    this.hazard!.setPosition(fight.tailX + fight.facing * 18, floor - JENNY_BOX.h - 10)
      .setFillStyle(0xffb020, fight.phase === 'stunned' && Math.floor(now / blink) % 2 === 0 ? 0.95 : 0);
    const revving = fight.phase === 'rev' || fight.phase === 'charge';
    this.lamp!.setPosition(fight.x + fight.facing * (JENNY_BOX.w / 2 - 6), floor - 22)
      .setFillStyle(0xfff4cb, revving ? (fight.phase === 'rev' ? 0.4 + 0.5 * (Math.floor(now / 90) % 2) : 0.9) : 0);
    if (fight.phase !== 'rev') return;
    if ((this.puff -= milliseconds) > 0) return;
    this.puff = 90;
    if (Math.floor(fight.elapsed * 4) % 2 === 0) sound.play('jenny-engine');
    const puff = this.scene.add.circle(fight.tailX, floor - 18, 6, 0x9aa3a8, 0.7).setDepth(DEPTH - 1);
    this.scene.tweens.add({ targets: puff, x: puff.x - fight.facing * (24 + Math.random() * 20), y: puff.y - 12 - Math.random() * 10,
      scale: 2.4, alpha: 0, duration: 420, onComplete: () => puff.destroy() });
  }

  private drawParts(fight: JennyFight): void {
    for (const [part, s] of this.parts) if (!fight.parts.includes(part)) { s.destroy(); this.parts.delete(part); this.hurt.delete(part); }
    for (const part of fight.parts) {
      let s = this.parts.get(part);
      if (!s) { s = this.scene.add.sprite(part.x, part.y, 'boss-jenny-2', `${part.kind}-00`).setOrigin(0.5, 1).setDepth(DEPTH); this.parts.set(part, s); }
      const frame = `${part.kind}-0${Math.floor(this.scene.time.now / 120) % 2}`;
      if (this.scene.textures.get('boss-jenny-2').has(frame)) s.setFrame(frame);
      // Debris art is drawn at the car's scale; a part is about a third of its board cell. It blinks before it goes.
      s.setScale(0.35).setPosition(Math.round(part.x), Math.round(part.y)).setAngle(part.landed ? 0 : part.x * 2)
        .setVisible(!blinking(part) || Math.floor(this.scene.time.now / 80) % 2 === 0);
    }
  }

  private contact(fight: JennyFight): void {
    const body = this.player.body;
    const hero = { x: body.x - BODY_WIDTH / 2, y: body.y - BODY_HEIGHT, w: BODY_WIDTH, h: BODY_HEIGHT };
    // Only her charge hurts, nose first (jenny.ts contactAt): thrown up and the way she drives; she brakes; the screen takes it.
    const damage = fight.contactAt(body.x);
    if (damage && intersects(fight.bounds, hero)) {
      const knock = ramKnock(body.x, fight.facing);
      if (this.player.damage(damage, knock.sourceX)) {
        body.vy = knock.vy;
        fight.bumped();
        this.chair.pause.trigger();
        this.scene.cameras.main.shake(SHAKE.ram[0], SHAKE.ram[1]);
        this.sparks(body.x, 0xfff4cb, 8);
      }
    }
    for (const part of fight.parts) {
      if (this.hurt.has(part)) continue;
      const box = { x: part.x - 12, y: part.y - 24, w: 24, h: 24 };
      if (intersects(box, hero) && this.player.damage(PART_DAMAGE, part.x)) this.hurt.add(part);
    }
  }
}
