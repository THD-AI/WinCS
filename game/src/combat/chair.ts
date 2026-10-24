import Phaser from 'phaser';
import { carriesChair } from './chairPickup';
import type { Player } from '../player/player';
import { sound } from '../fx/sound/Audio';
import { HitStop, Sweeps, SWEEP_CONTACT, type Damageable, type Rect } from './sweeps';
import { Overhead, SLAM_SPEED } from './overhead';
import { Guard } from './guard';
import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import { actionEdges, attackClick, AttackBuffer } from './action-input';
import { lowStreak, swingArc } from './swingFx';
import { LOW_CONTACT, LowSweep } from './lowSweep';
import { pickAssist } from './assist';
import { UP_CONTACT } from './overhead';
import { CODES, physicalKeys } from '../player/physicalKeys';

const ROVER_HEIGHT = 25; // docs/05 and approved enemy-rover:idle-00 alpha height.
const ROVER_WIDTH = 31; // Approved enemy-rover:idle-00 alpha width; compare.py measures 31×25.
const FIXTURE_KNOCK = 8; // docs/02: development fixture displacement, not real enemy tuning.
const GRAIN = 2; // docs/09: two-pixel grain; retain this overlap after the fixture moves.

export class ChairCombat {
  readonly sweeps = new Sweeps();
  readonly pause = new HitStop();
  readonly overhead = new Overhead();
  readonly guard = new Guard();
  /** ↓ + Act on the ground: the chair along the floor (lowSweep.ts). */
  readonly low = new LowSweep();
  private targets = new Map<string, Damageable>();
  private key: Phaser.Input.Keyboard.Key;
  /** The second attack bind (playtest 24 Oct): X, for players on the arrow keys. */
  private altKey: Phaser.Input.Keyboard.Key;
  private physical: { any(codes: readonly string[]): boolean };
  private wasDown = false;
  /** A press the chair could not take yet (action-input.ts). */
  private buffer = new AttackBuffer();
  /** The left mouse button on the canvas (attackClick): held, and its edges since the last frame. */
  private mouse = { down: false, pressed: false, released: false };
  private special = false;
  private plainTap = false;
  private directions;
  private previousY: number;
  private debug: Phaser.GameObjects.Graphics;
  /** The visible swing: an arc in front of the hero, and the flash of the overhead strike (swingFx.ts). */
  private trail: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private visible = false;
  enabled: boolean;
  constructor(private scene: Phaser.Scene, private player: Player, _region: string) {
    // Armed once the hero picked the chair up (chairPickup.ts), in every region after that.
    this.enabled = carriesChair(scene);
    this.key = scene.input.keyboard!.addKey('J');
    this.altKey = scene.input.keyboard!.addKey('X');
    this.physical = physicalKeys(scene);
    this.directions = scene.input.keyboard!.addKeys('W,S,UP,DOWN') as Record<string, Phaser.Input.Keyboard.Key>;
    this.previousY = player.body.y;
    const oldHazards = player.onHazards;
    player.onHazards = boxes => {
      if (!this.enabled || !player.canAttack) return false;
      const top = this.overhead.hazard(player.body, this.previousY, boxes);
      if (top === undefined) return false;
      player.pogo(top); this.pause.trigger(); this.spark(boxes.find(box => box.y === top)!); return true;
    };
    scene.events.once('shutdown', () => { player.onHazards = oldHazards; });
    const press = (pointer: Phaser.Input.Pointer) => {
      if (!attackClick(pointer.button, pointer.wasTouch, pointer.event?.target, scene.game.canvas)) return;
      this.mouse.down = true; this.mouse.pressed = true;
    };
    const lift = (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0 || !this.mouse.down) return;
      this.mouse.down = false; this.mouse.released = true;
    };
    scene.input.on('pointerdown', press); scene.input.on('pointerup', lift); scene.input.on('pointerupoutside', lift);
    scene.events.once('shutdown', () => {
      scene.input.off('pointerdown', press); scene.input.off('pointerup', lift); scene.input.off('pointerupoutside', lift);
    });
    const oldGuard = player.onGuard;
    player.onGuard = (damage, sourceX) => {
      if (!this.enabled || !player.canAttack) return false;
      const block = this.guard.receive(damage, sourceX, player.body.x);
      if (block.blocked && block.fresh) {
        player.pushGuard(-this.guard.direction); this.pause.trigger();
        this.spark({ x: player.body.x + this.guard.direction * BODY_WIDTH / 2,
          y: player.body.y - BODY_HEIGHT / 2, w: GRAIN, h: GRAIN });
      }
      return block.blocked;
    };
    scene.events.once('shutdown', () => { player.onGuard = oldGuard; });
    this.debug = scene.add.graphics().setDepth(10003);
    this.trail = scene.add.graphics().setDepth(105).setBlendMode(Phaser.BlendModes.ADD);
    this.label = scene.add.text(20, 260, '', { fontFamily: 'monospace', fontSize: '18px', backgroundColor: '#17242d' })
      .setDepth(10004).setScrollFactor(0).setVisible(false);
    const toggle = () => { this.visible = !this.visible; this.label.setVisible(this.visible); };
    scene.input.keyboard?.on('keydown-F2', toggle);
    scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown-F2', toggle));
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('combat-test')) this.dummy();
  }
  /**
   * Target assist (assist.ts) as an attack starts: turn to an enemy just behind, nudge toward one just out of reach.
   * Never during a guard – a guarded hold never starts an attack.
   */
  private assist(kind: 'sweep' | 'low' | 'up', reach: number) {
    const boxes = [...this.targets.values()].filter(target => target.active?.() !== false).map(target => target.bounds());
    const pick = pickAssist(this.player.body, this.player.facing, boxes, kind, reach);
    if (!pick) return undefined;
    if (pick.turn) this.player.face(pick.direction);
    if (pick.lunge > 0) this.player.lunge(pick.direction * pick.lunge);
    return pick;
  }
  /** A plain tap: the side swing, or the up attack under a hovering drone (assist.ts). */
  private startTap() {
    const first = this.sweeps.phase === 'idle';
    if (first && this.assist('sweep', SWEEP_CONTACT.reach)?.up) { this.startOverhead('up'); return; }
    this.sweeps.press(this.player.facing);
    if (first) sound.play('chair-whoosh');
  }
  private startOverhead(kind: 'up' | 'slam') {
    if (kind === 'up' && this.overhead.phase === 'idle') this.assist('up', UP_CONTACT.right);
    if (this.overhead.begin(kind, this.player.facing)) sound.play('chair-whoosh');
  }
  private startLow() {
    this.assist('low', LOW_CONTACT.reach);
    if (this.low.begin(this.player.facing)) sound.play('chair-whoosh');
  }
  register(target: Damageable) {
    this.targets.set(target.id, target);
    return () => { if (this.targets.get(target.id) === target) this.targets.delete(target.id); };
  }
  /** A landed hit: a white impact ring and a burst of sparks at the target, with the hit sound. */
  private spark(box: Rect) {
    sound.play('chair-hit');
    const x = box.x + box.w / 2, y = box.y + box.h / 2;
    const ring = this.scene.add.circle(x, y, 10, 0xffffff, 0.85).setDepth(120).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 160, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const pixel = this.scene.add.rectangle(x, y, 4, 3, i % 3 ? 0xfff4cb : 0xffc35a).setDepth(120);
      this.scene.tweens.add({ targets: pixel, x: x + Math.cos(angle) * (18 + (i % 3) * 6), y: y + Math.sin(angle) * (14 + (i % 2) * 6),
        alpha: 0, duration: 200, onComplete: () => pixel.destroy() });
    }
  }
  private dummy() {
    const table = this.scene.cache.json.get('enemy-rover.anims');
    const distance = SWEEP_CONTACT.reach + ROVER_WIDTH / 2 - FIXTURE_KNOCK - GRAIN;
    const actor = this.scene.add.sprite(this.player.body.x + distance, this.player.body.y, 'enemy-rover', Object.keys(table)[0] + '-00')
      .setOrigin(0.5, 1).setDepth(101);
    const spawn = { x: actor.x, y: actor.y };
    let count = 0, slams = 0;
    const counter = this.scene.add.text(actor.x, actor.y - 40, 'hits 0', { fontSize: '14px', backgroundColor: '#17242d' }).setDepth(102);
    const bounds = () => ({ x: actor.x - ROVER_WIDTH / 2, y: actor.y - ROVER_HEIGHT, w: ROVER_WIDTH, h: ROVER_HEIGHT });
    this.register({ id: 'verification-rover', bounds, hit: hit => {
      count++; if (hit.kind === 'slam') slams++;
      actor.x += hit.direction * FIXTURE_KNOCK; actor.setTintFill(0xffffff);
      counter.setPosition(actor.x, actor.y - 40).setText('hits ' + count + ' | slam ' + slams);
      this.scene.time.delayedCall(100, () => actor.clearTint()); return true;
    } });
    this.player.life.register('verification-rover', () => {
      count = 0; slams = 0; actor.setPosition(spawn.x, spawn.y); counter.setPosition(spawn.x, spawn.y - 40).setText('hits 0');
    });
  }
  update(milliseconds: number) {
    this.guard.step(milliseconds / 1000);
    if (this.guard.phase !== 'break') this.guard.direction = this.player.facing;
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const down = this.key.isDown || this.altKey.isDown || this.physical.any(CODES.attack) || !!pad?.X || this.mouse.down;
    // Both edge checks run every frame so neither key keeps a stale Just-flag.
    const justUp = [this.key, this.altKey].map(k => Phaser.Input.Keyboard.JustUp(k)).some(Boolean) || this.mouse.released;
    const justDown = [this.key, this.altKey].map(k => Phaser.Input.Keyboard.JustDown(k)).some(Boolean) || this.mouse.pressed;
    this.mouse.pressed = false; this.mouse.released = false;
    const { pressed, released } = actionEdges(down, this.wasDown, justDown, justUp);
    const up = this.directions.W.isDown || this.directions.UP.isDown || this.physical.any(CODES.up) || !!pad?.up || (pad?.leftStick.y ?? 0) < -0.2;
    const below = this.directions.S.isDown || this.directions.DOWN.isDown || this.physical.any(CODES.down) || !!pad?.down || (pad?.leftStick.y ?? 0) > 0.2;
    this.buffer.step(milliseconds / 1000);
    if (this.enabled && pressed && this.player.dodge.active) {
      // Pressed during a dodge-dash: struck as the dash ends.
      this.buffer.hold(up ? 'up' : below ? 'down' : 'tap');
    } else if (this.enabled && this.player.canAttack && pressed && (up || below && !this.player.body.grounded)) {
      this.special = true; this.plainTap = false; this.guard.cancel(); this.sweeps.cancel(); this.low.cancel();
      // The slam's descent and pogo queue their own next press (overhead.ts); other overhead poses buffer it.
      const queues = this.overhead.phase === 'idle' || this.overhead.phase === 'pogo' || this.overhead.phase === 'descend';
      if (queues) this.startOverhead(up ? 'up' : 'slam'); else this.buffer.hold(up ? 'up' : 'down');
    } else if (this.enabled && this.player.canAttack && pressed && below && this.overhead.phase === 'idle') {
      this.special = true; this.plainTap = false; this.guard.cancel(); this.sweeps.cancel();
      if (this.low.active) this.buffer.hold('down'); else this.startLow();
    } else if (this.enabled && this.player.canAttack && pressed) {
      this.plainTap = true;
      if (this.sweeps.phase === 'idle' && this.overhead.phase === 'idle' && !this.low.active) this.guard.press(this.player.facing);
    }
    if (down && this.plainTap && this.guard.phase === 'idle' && this.sweeps.phase === 'idle'
      && this.overhead.phase === 'idle' && !this.low.active && this.enabled && this.player.canAttack) this.guard.press(this.player.facing);
    let tap = false;
    if (released) { tap = this.guard.phase === 'idle' ? this.plainTap : this.guard.release(); this.plainTap = false; }
    if (this.enabled && this.player.canAttack && !this.special && tap && released) {
      if (this.overhead.phase === 'idle' && !this.low.active) this.startTap(); else this.buffer.hold('tap');
    }
    if (released) this.special = false;
    this.wasDown = down;
    // A buffered press starts the moment the chair is free.
    if (this.buffer.pending && this.enabled && this.player.canAttack && this.overhead.phase === 'idle' && !this.low.active
      && this.guard.phase === 'idle') {
      const kind = this.buffer.take();
      if (kind === 'tap') this.startTap();
      else if (kind === 'up') this.startOverhead('up');
      else if (this.player.body.grounded) this.startLow();
      else this.startOverhead('slam');
    }
    if (!this.enabled || !this.player.canAttack) {
      if (!this.player.dodge.active) this.buffer.clear();
      this.sweeps.cancel(); this.overhead.cancel(); this.low.cancel(); this.plainTap = false;
      if (!this.enabled || this.guard.phase !== 'break' || this.player.life.dead > 0) this.guard.cancel();
    }
    let remaining = milliseconds / 1000;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120), previous = this.sweeps.phase;
      this.sweeps.step(dt);
      this.overhead.step(dt);
      this.low.step(dt);
      if (previous !== this.sweeps.phase && (this.sweeps.phase === 'sweep-a' || this.sweeps.phase === 'sweep-b')) sound.play('chair-whoosh');
      const contact = this.overhead.contact(this.player.body, this.previousY, this.targets.values());
      if (contact.bounce !== undefined) this.player.pogo(contact.bounce);
      this.overhead.land(this.player.body.grounded);
      const hits = [...this.sweeps.hit(this.player.body, this.targets.values()), ...this.low.hit(this.player.body, this.targets.values()), ...contact.hits];
      if (hits.length) { hits.forEach(box => this.spark(box)); this.pause.trigger(); break; }
      remaining -= dt;
    }
    if (this.overhead.phase === 'descend') this.player.body.vy = Math.max(this.player.body.vy, SLAM_SPEED);
    if (this.sweeps.phase !== 'idle') {
      const frame = this.sweeps.phase + '-' + String(this.sweeps.frame).padStart(2, '0');
      if (this.scene.textures.get('chair-side').has(frame)) this.player.sprite.setTexture('chair-side', frame)
        .setFlipX((this.sweeps.direction < 0) !== (this.sweeps.phase === 'sweep-b'));
    }
    if (this.overhead.pose) this.player.sprite.setTexture('chair-overhead', this.overhead.pose).setFlipX(this.overhead.direction < 0);
    if (this.low.pose) this.player.sprite.setTexture('chair-overhead', this.low.pose).setFlipX(this.low.direction < 0);
    if (this.guard.pose) this.player.sprite.setTexture('chair-block', this.guard.pose).setFlipX(this.guard.direction < 0);
    this.trail.clear();
    const arc = swingArc(this.sweeps.phase, this.sweeps.frame, this.sweeps.direction, this.player.body);
    if (arc) {
      this.trail.lineStyle(arc.width, 0xfff4cb, 0.55 * arc.alpha).beginPath().arc(arc.x, arc.y, arc.radius, arc.start, arc.end).strokePath();
      this.trail.lineStyle(3, 0xffffff, arc.alpha).beginPath().arc(arc.x, arc.y, arc.radius + arc.width / 2, arc.start, arc.end).strokePath();
    }
    const streak = this.low.active ? lowStreak(this.low.frame, this.low.direction, this.player.body, LOW_CONTACT) : undefined;
    if (streak) {
      this.trail.fillStyle(0xfff4cb, 0.5 * streak.alpha).fillRoundedRect(streak.x, streak.y, streak.w, streak.h, 6);
      this.trail.lineStyle(3, 0xffffff, streak.alpha).lineBetween(streak.x, streak.y + streak.h - 2, streak.x + streak.w, streak.y + streak.h - 2);
    }
    const strike = this.overhead.box(this.player.body, this.previousY);
    if (strike) this.trail.fillStyle(0xfff4cb, 0.35).fillRoundedRect(strike.x, strike.y, strike.w, strike.h, 6);
    this.debug.clear();
    const box = this.sweeps.box(this.player.body) ?? this.low.box(this.player.body) ?? this.overhead.box(this.player.body, this.previousY);
    if (this.visible && box) this.debug.lineStyle(2, 0xff7835).strokeRect(box.x, box.y, box.w, box.h);
    this.label.setText('chair ' + (this.guard.pose ?? this.overhead.pose ?? (this.low.pose && 'low ' + this.low.pose) ?? this.sweeps.phase + ' ' + this.sweeps.frame)
      + ' | hit-stop ' + this.pause.remaining.toFixed(0) + 'ms | blocks ' + this.guard.blocks);
    this.previousY = this.player.body.y;
  }
}
