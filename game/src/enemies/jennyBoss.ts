import type Phaser from 'phaser';
import { gameEvents } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { ChairCombat } from '../combat/chair';
import { intersects } from '../combat/sweeps';
import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import type { Player } from '../player/player';
import type { AnimationTable } from '../stage/assets';
import type { Box, CollisionChunk } from '../stage/collision';
import { arenaFrom, JENNY_HEALTH, JennyFight, PART_DAMAGE, type Part } from './jenny';

const ID = 'jenny';
const NAME = 'Jenny';
/** The wall that drops behind you at the boss gate: as tall as the gate box. */
const DEPTH = 101;
type Hud = Phaser.Scene & { model?: { showBoss(name: string, max: number): void; setBossHealth(h: number): void; hideBoss(): void } };

/**
 * Draws and wires Jenny's fight (#57) into the stage. Everything comes from the region's collision: her `jenny`
 * spawn, the `boss-gate` box that closes behind you, and the floor she drives on. Walking through the gate
 * starts the fight and the boss bar; beating her emits `boss-defeated`, which the Ending scene turns into the
 * end of the slice. Dying resets the fight.
 */
export class JennyBoss {
  private fight?: JennyFight;
  private sprite?: Phaser.GameObjects.Sprite;
  private parts = new Map<Part, Phaser.GameObjects.Sprite>();
  private hurt = new Set<Part>();
  private wall?: { box: Box; list: Box[] };
  private gate?: Box;
  private flash = 0;
  private cleanup: (() => void)[] = [];

  constructor(private scene: Phaser.Scene, private player: Player, chair: ChairCombat, chunks: CollisionChunk[]) {
    const spawn = chunks.flatMap(c => c.world.spawn).find(s => s.kind === 'jenny');
    const gateChunk = chunks.find(c => c.world.interact.some(b => b.kind === 'boss-gate'));
    this.gate = gateChunk?.world.interact.find(b => b.kind === 'boss-gate');
    if (!spawn || !this.gate || !gateChunk || player.life.defeatedBosses.has(ID)) return;
    const clips = { ...scene.cache.json.get('boss-jenny.anims'), ...scene.cache.json.get('boss-jenny-2.anims') } as AnimationTable;
    const walk = chunks.flatMap(c => c.world.walk);
    this.fight = new JennyFight(arenaFrom(this.gate, spawn, walk), spawn.x, clips);
    this.wall = { box: { id: 'boss-wall', kind: 'boss-wall', x: this.gate.x, y: this.gate.y - 200, w: this.gate.w, h: this.gate.h + 200 },
      list: gateChunk.world.solid };
    this.sprite = scene.add.sprite(spawn.x, spawn.y, 'boss-jenny', 'rev-00').setOrigin(0.5, 1).setDepth(DEPTH);
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
    if (!this.wall!.list.includes(this.wall!.box)) this.wall!.list.push(this.wall!.box);
    this.hud?.model?.showBoss(NAME, JENNY_HEALTH);
  }

  private hit(damage: number, direction: number): boolean {
    const fight = this.fight!;
    const landed = fight.hit(damage, direction);
    if (landed) { this.flash = 0.08; this.hud?.model?.setBossHealth(fight.health); }
    else sound.play('chair-hit'); // the armoured nose: a dull clank, no damage
    return landed;
  }

  private reset(): void {
    this.fight?.reset();
    this.openWall();
    for (const s of this.parts.values()) s.destroy();
    this.parts.clear(); this.hurt.clear();
    if (this.fight?.phase === 'waiting') this.hud?.model?.hideBoss();
  }

  private openWall(): void {
    if (!this.wall) return;
    const i = this.wall.list.indexOf(this.wall.box);
    if (i >= 0) this.wall.list.splice(i, 1);
  }

  update(milliseconds: number): void {
    const fight = this.fight, sprite = this.sprite;
    if (!fight || !sprite) return;
    if (fight.step(milliseconds / 1000)) {
      this.openWall();
      gameEvents.emit('boss-defeated', { id: ID, position: { x: fight.x, y: fight.arena.floor } });
    }
    const { atlas, name } = fight.frame;
    if (this.scene.textures.get(atlas).has(name)) sprite.setTexture(atlas, name);
    // The approved frames face left (nose left), so a right-facing Jenny is mirrored.
    sprite.setPosition(Math.round(fight.x), fight.arena.floor).setFlipX(fight.facing > 0)
      .setVisible(fight.phase !== 'gone').setAlpha(fight.phase === 'stall' ? 0.6 + 0.4 * Math.random() : 1);
    this.flash = Math.max(0, this.flash - milliseconds / 1000);
    if (this.flash > 0) sprite.setTintFill(0xffffff); else sprite.clearTint();
    this.drawParts(fight);
    this.contact(fight);
  }

  private drawParts(fight: JennyFight): void {
    for (const [part, s] of this.parts) if (!fight.parts.includes(part)) { s.destroy(); this.parts.delete(part); this.hurt.delete(part); }
    for (const part of fight.parts) {
      let s = this.parts.get(part);
      if (!s) { s = this.scene.add.sprite(part.x, part.y, 'boss-jenny-2', `${part.kind}-00`).setOrigin(0.5, 1).setDepth(DEPTH); this.parts.set(part, s); }
      const frame = `${part.kind}-0${Math.floor(this.scene.time.now / 120) % 2}`;
      if (this.scene.textures.get('boss-jenny-2').has(frame)) s.setFrame(frame);
      // Debris art is drawn at the car's scale; a part is about a third of its board cell.
      s.setScale(0.35).setPosition(Math.round(part.x), Math.round(part.y)).setAngle(part.landed ? 0 : part.x * 2);
    }
  }

  private contact(fight: JennyFight): void {
    const body = this.player.body;
    const hero = { x: body.x - BODY_WIDTH / 2, y: body.y - BODY_HEIGHT, w: BODY_WIDTH, h: BODY_HEIGHT };
    if (fight.contactDamage && intersects(fight.bounds, hero)) this.player.damage(fight.contactDamage, fight.x);
    for (const part of fight.parts) {
      if (this.hurt.has(part)) continue;
      const box = { x: part.x - 12, y: part.y - 24, w: 24, h: 24 };
      if (intersects(box, hero) && this.player.damage(PART_DAMAGE, part.x)) this.hurt.add(part);
    }
  }
}
