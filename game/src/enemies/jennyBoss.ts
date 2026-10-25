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
import { arenaFrom, blinking, JENNY_BOX, JENNY_HEALTH, JennyFight, PART_DAMAGE, RAM_GRACE, STUN_WARNING, type JennyPhase, type Part } from './jenny';

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
/**
 * Shed parts (playtest 24 Oct: "very easily missable"): drawn at this share of their board cell (~45 × 40 px), with a
 * shadow on the floor under every part in the air, so you see where it will land. The hurt box is a little smaller
 * than the drawing.
 */
export const PART_SCALE = 0.45, PART_BOX = 30;

/** The part's hurt box: its drawn body, a little inside the art, feet at `part.y`. */
export function partBox(part: { x: number; y: number }) {
  return { x: part.x - PART_BOX / 2, y: part.y - PART_BOX, w: PART_BOX, h: PART_BOX };
}
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
  private shadows = new Map<Part, Phaser.GameObjects.Ellipse>();
  /** The arena's two walls, drawn while they are closed so they are never invisible. */
  private barriers: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite)[] = [];
  /** Her path in the rev: a strip on the floor from her nose to the wall she will hit. */
  private path?: Phaser.GameObjects.Rectangle;
  /** Stars circling over her while she is stunned: she is dazed, hit her now. */
  private stars: Phaser.GameObjects.Star[] = [];
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
    // Over the near strip (z 6, depth 120+), so the path shows on the girder floor instead of behind its front edge.
    this.path = scene.add.rectangle(spawn.x, spawn.y, 10, 8, 0xff5a3c, 0).setOrigin(0, 1).setDepth(125);
    for (let i = 0; i < 3; i++) this.stars.push(scene.add.star(spawn.x, spawn.y, 5, 3, 7, 0xffe14a).setDepth(DEPTH + 2).setVisible(false));
    this.barriers = [this.wall.box, this.wall.far].map(box => this.drawBarrier(box));
    this.cleanup.push(
      chair.register({ id: ID, active: () => !!this.fight && this.fight.active && this.fight.health > 0,
        bounds: () => this.fight!.bounds, hit: hit => this.hit(hit.damage, hit.direction) }),
      player.life.register(ID, () => this.reset(), true),
      gameEvents.on('trigger-entered', ({ kind }) => { if (kind === 'boss-gate') this.start(); }),
    );
    scene.events.once('shutdown', () => this.cleanup.forEach(off => off()));
  }

  private get hud(): Hud | undefined { return this.scene.scene.get('HUD') as Hud | undefined; }

  /**
   * Start the fight once the hero is inside the arena, however he got there (playtest 24 Oct: it only started
   * through the gate box at one spot). Checked every frame, and from the gate trigger. The walls close only when
   * the hero is clear of them, so they never land on him.
   */
  private start(): void {
    const fight = this.fight, body = this.player.body;
    if (!fight || fight.phase !== 'waiting' || this.player.life.dead > 0) return;
    if (!fight.inArena(body.x - BODY_WIDTH / 2, body.y) || !fight.inArena(body.x + BODY_WIDTH / 2, body.y)) return;
    fight.start(body.x);
    const wall = this.wall!;
    if (!wall.list.includes(wall.box)) wall.list.push(wall.box);
    if (!wall.list.includes(wall.far)) wall.list.push(wall.far);
    this.hud?.model?.showBoss(NAME, JENNY_HEALTH);
  }

  /**
   * A closed wall reads as "not until she is beaten": the barrier column (`arena-wall` board, its warning lamp
   * blinking), standing on the wall's foot; without the board, a rusted barrier with hazard stripes.
   */
  private drawBarrier(box: Box): Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite {
    if (this.scene.textures.exists('arena-wall')) {
      if (!this.scene.anims.exists('arena-wall:lamp')) this.scene.anims.create({ key: 'arena-wall:lamp', frameRate: 3, repeat: -1,
        frames: this.scene.anims.generateFrameNames('arena-wall', { prefix: 'lamp-', start: 0, end: 1, zeroPad: 2 }) });
      return this.scene.add.sprite(box.x + box.w / 2, box.y + box.h, 'arena-wall', 'lamp-00').setOrigin(0.5, 1)
        .setDepth(DEPTH + 3).setAlpha(0).play('arena-wall:lamp');
    }
    const g = this.scene.add.graphics({ x: box.x, y: box.y }).setDepth(DEPTH + 3).setAlpha(0);
    g.fillStyle(0x3a2418, 0.85).fillRect(0, 0, box.w, box.h);
    g.lineStyle(2, 0xc8642a, 1).strokeRect(1, 1, box.w - 2, box.h - 2);
    for (let y = 8; y < box.h - 4; y += 24) {
      g.fillStyle(0xffb020, 0.9).fillTriangle(2, y, box.w - 2, y + 10, 2, y + 18);
    }
    return g;
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
    for (const s of this.shadows.values()) s.destroy();
    this.parts.clear(); this.shadows.clear(); this.hurt.clear(); this.last = this.fight?.phase ?? 'waiting'; this.recoil = 0;
    if (this.fight?.phase === 'waiting') this.hud?.model?.hideBoss();
  }

  private openWall(): void {
    if (!this.wall) return;
    for (const box of [this.wall.box, this.wall.far]) {
      const i = this.wall.list.indexOf(box);
      if (i >= 0) this.wall.list.splice(i, 1);
    }
    for (const g of this.barriers) { this.scene.tweens.killTweensOf(g); this.scene.tweens.add({ targets: g, alpha: 0, duration: 400 }); }
  }

  update(milliseconds: number): void {
    const fight = this.fight, sprite = this.sprite;
    if (!fight || !sprite) return;
    if (fight.phase === 'waiting') this.start();
    for (let i = 0; i < this.barriers.length; i++) {
      const closed = this.wall!.list.includes(i ? this.wall!.far : this.wall!.box);
      if (closed && this.barriers[i].alpha === 0) this.scene.tweens.add({ targets: this.barriers[i], alpha: 1, duration: 250 });
    }
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
    // The whole car glows while she is open to any hit (crashed or stunned), with stars circling over her.
    if (open === 'all') this.glow!.setPosition(fight.x, floor - JENNY_BOX.h / 2).setSize(JENNY_BOX.w + 20, JENNY_BOX.h + 30);
    else this.glow!.setSize(48, 40);
    this.stars.forEach((star, i) => {
      const a = now / 260 + (i * Math.PI * 2) / this.stars.length;
      star.setVisible(fight.phase === 'stunned').setPosition(fight.x + Math.cos(a) * 34, floor - JENNY_BOX.h - 26 + Math.sin(a) * 8)
        .setAngle(now / 4);
    });
    // Her path in the rev: a red strip from her nose to the wall she is about to drive into.
    if (fight.phase === 'rev') {
      const nose = fight.x + fight.facing * JENNY_BOX.w / 2, end = fight.target + fight.facing * JENNY_BOX.w / 2;
      const left = Math.min(nose, end), width = Math.max(4, Math.abs(end - nose));
      this.path!.setPosition(left, floor + 2).setSize(width, 8).setFillStyle(0xff5a3c, 0.35 + 0.4 * (Math.floor(now / 120) % 2));
    } else this.path!.setFillStyle(0xff5a3c, 0);
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
    for (const [part, s] of this.parts) if (!fight.parts.includes(part)) {
      s.destroy(); this.shadows.get(part)?.destroy(); this.parts.delete(part); this.shadows.delete(part); this.hurt.delete(part);
    }
    for (const part of fight.parts) {
      let s = this.parts.get(part);
      if (!s) {
        s = this.scene.add.sprite(part.x, part.y, 'boss-jenny-2', `${part.kind}-00`).setOrigin(0.5, 1).setDepth(DEPTH + 1);
        addRim(s, ACTOR_RIM.colour, ACTOR_RIM.strength);
        this.parts.set(part, s);
        this.shadows.set(part, this.scene.add.ellipse(part.x, fight.arena.floor, 28, 6, 0x000000, 0.45).setDepth(DEPTH - 1));
      }
      // Its shadow on the floor shows where it comes down; it grows as the part falls closer.
      const height = fight.arena.floor - part.y;
      this.shadows.get(part)!.setPosition(Math.round(part.x), fight.arena.floor).setVisible(height > 2)
        .setScale(Math.max(0.5, 1.4 - height / 300));
      const frame = `${part.kind}-0${Math.floor(this.scene.time.now / 120) % 2}`;
      if (this.scene.textures.get('boss-jenny-2').has(frame)) s.setFrame(frame);
      // Debris art is drawn at the car's scale; a part is about a third of its board cell. It blinks before it goes.
      s.setScale(PART_SCALE).setPosition(Math.round(part.x), Math.round(part.y)).setAngle(part.landed ? 0 : part.x * 2)
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
        // One hit, not a chain: the throw, her crash and its parts cannot hurt again for a while (RAM_GRACE).
        this.player.life.invulnerable = Math.max(this.player.life.invulnerable, RAM_GRACE);
        body.vy = knock.vy;
        fight.bumped();
        this.chair.pause.trigger();
        this.scene.cameras.main.shake(SHAKE.ram[0], SHAKE.ram[1]);
        this.sparks(body.x, 0xfff4cb, 8);
      }
    }
    for (const part of fight.parts) {
      if (this.hurt.has(part)) continue;
      if (intersects(partBox(part), hero) && this.player.damage(PART_DAMAGE, part.x)) this.hurt.add(part);
    }
  }
}
