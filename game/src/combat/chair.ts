import Phaser from 'phaser';
import type { Player } from '../player/player';
import { sound } from '../fx/sound/Audio';
import { HitStop, Sweeps, SWEEP_CONTACT, type Damageable, type Rect } from './sweeps';
import { Overhead, SLAM_SPEED } from './overhead';

const ROVER_HEIGHT = 25; // docs/05 and approved enemy-rover:idle-00 alpha height.
const ROVER_WIDTH = 31; // Approved enemy-rover:idle-00 alpha width; compare.py measures 31×25.
const FIXTURE_KNOCK = 8; // docs/02: development fixture displacement, not real enemy tuning.
const GRAIN = 2; // docs/09: two-pixel grain; retain this overlap after the fixture moves.

export class ChairCombat {
  readonly sweeps = new Sweeps();
  readonly pause = new HitStop();
  readonly overhead = new Overhead();
  private targets = new Map<string, Damageable>();
  private key: Phaser.Input.Keyboard.Key;
  private wasDown = false;
  private special = false;
  private directions;
  private previousY: number;
  private debug: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private visible = false;
  enabled: boolean;
  constructor(private scene: Phaser.Scene, private player: Player, region: string) {
    this.enabled = region === 'rusty-creek';
    this.key = scene.input.keyboard!.addKey('J');
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
    this.debug = scene.add.graphics().setDepth(10003);
    this.label = scene.add.text(20, 260, '', { fontFamily: 'monospace', fontSize: '18px', backgroundColor: '#17242d' })
      .setDepth(10004).setScrollFactor(0).setVisible(false);
    const toggle = () => { this.visible = !this.visible; this.label.setVisible(this.visible); };
    scene.input.keyboard?.on('keydown-F2', toggle);
    scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown-F2', toggle));
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('combat-test')) this.dummy();
  }
  register(target: Damageable) {
    this.targets.set(target.id, target);
    return () => { if (this.targets.get(target.id) === target) this.targets.delete(target.id); };
  }
  private spark(box: Rect) {
    sound.play('chair-hit');
    for (let i = 0; i < 6; i++) {
      const pixel = this.scene.add.rectangle(box.x + box.w / 2, box.y + box.h / 2, 3, 2, 0xfff4cb).setDepth(120);
      this.scene.tweens.add({ targets: pixel, x: pixel.x - 12 + i * 5, y: pixel.y - 14 + i % 3 * 8,
        alpha: 0, duration: 140, onComplete: () => pixel.destroy() });
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
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const down = this.key.isDown || !!pad?.X;
    const pressed = Phaser.Input.Keyboard.JustDown(this.key) || down && !this.wasDown;
    const keyReleased = Phaser.Input.Keyboard.JustUp(this.key);
    const up = this.directions.W.isDown || this.directions.UP.isDown || !!pad?.up || (pad?.leftStick.y ?? 0) < -0.2;
    const below = this.directions.S.isDown || this.directions.DOWN.isDown || !!pad?.down || (pad?.leftStick.y ?? 0) > 0.2;
    if (this.enabled && this.player.canAttack && pressed && (up || below && !this.player.body.grounded)) {
      this.special = true; this.sweeps.cancel();
      if (this.overhead.begin(up ? 'up' : 'slam', this.player.facing)) sound.play('chair-whoosh');
    }
    if (this.enabled && this.player.canAttack && !this.special && this.overhead.phase === 'idle' && !down && (this.wasDown || keyReleased)) {
      const first = this.sweeps.phase === 'idle';
      this.sweeps.press(this.player.facing);
      if (first) sound.play('chair-whoosh');
    }
    if (!down && (this.wasDown || keyReleased)) this.special = false;
    this.wasDown = down;
    if (!this.enabled || !this.player.canAttack) { this.sweeps.cancel(); this.overhead.cancel(); }
    let remaining = milliseconds / 1000;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120), previous = this.sweeps.phase;
      this.sweeps.step(dt);
      this.overhead.step(dt);
      if (previous !== this.sweeps.phase && (this.sweeps.phase === 'sweep-a' || this.sweeps.phase === 'sweep-b')) sound.play('chair-whoosh');
      const contact = this.overhead.contact(this.player.body, this.previousY, this.targets.values());
      if (contact.bounce !== undefined) this.player.pogo(contact.bounce);
      this.overhead.land(this.player.body.grounded);
      const hits = [...this.sweeps.hit(this.player.body, this.targets.values()), ...contact.hits];
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
    this.debug.clear();
    const box = this.sweeps.box(this.player.body) ?? this.overhead.box(this.player.body, this.previousY);
    if (this.visible && box) this.debug.lineStyle(2, 0xff7835).strokeRect(box.x, box.y, box.w, box.h);
    this.label.setText('chair ' + (this.overhead.pose ?? this.sweeps.phase + ' ' + this.sweeps.frame) + ' | hit-stop ' + this.pause.remaining.toFixed(0) + 'ms');
    this.previousY = this.player.body.y;
  }
}
