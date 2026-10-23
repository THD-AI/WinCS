import Phaser from 'phaser';
import type { Player } from '../player/player';
import { sound } from '../fx/sound/Audio';
import { HitStop, Sweeps, type Damageable, type Rect } from './sweeps';

export class ChairCombat {
  readonly sweeps = new Sweeps();
  readonly pause = new HitStop();
  private targets = new Map<string, Damageable>();
  private key: Phaser.Input.Keyboard.Key;
  private wasDown = false;
  private debug: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private visible = false;
  enabled: boolean;
  constructor(private scene: Phaser.Scene, private player: Player, region: string) {
    this.enabled = region === 'rusty-creek';
    this.key = scene.input.keyboard!.addKey('J');
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
    const actor = this.scene.add.sprite(this.player.body.x + 48, this.player.body.y, 'enemy-rover', Object.keys(table)[0] + '-00')
      .setOrigin(0.5, 1).setDepth(101);
    const spawn = { x: actor.x, y: actor.y };
    let count = 0;
    const counter = this.scene.add.text(actor.x, actor.y - 40, 'hits 0', { fontSize: '14px', backgroundColor: '#17242d' }).setDepth(102);
    const bounds = () => ({ x: actor.x - 12.5, y: actor.y - 25, w: 25, h: 25 });
    this.register({ id: 'verification-rover', bounds, hit: hit => {
      count++; actor.x += hit.direction * 8; actor.setTintFill(0xffffff);
      counter.setPosition(actor.x, actor.y - 40).setText('hits ' + count);
      this.scene.time.delayedCall(100, () => actor.clearTint()); return true;
    } });
    this.player.life.register('verification-rover', () => {
      count = 0; actor.setPosition(spawn.x, spawn.y); counter.setPosition(spawn.x, spawn.y - 40).setText('hits 0');
    });
  }
  update(milliseconds: number) {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const down = this.key.isDown || !!pad?.X;
    const keyReleased = Phaser.Input.Keyboard.JustUp(this.key);
    if (this.enabled && this.player.canAttack && !down && (this.wasDown || keyReleased)) {
      const first = this.sweeps.phase === 'idle';
      this.sweeps.press(this.player.facing);
      if (first) sound.play('chair-whoosh');
    }
    this.wasDown = down;
    if (!this.enabled || !this.player.canAttack) this.sweeps.cancel();
    let remaining = milliseconds / 1000;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120), previous = this.sweeps.phase;
      this.sweeps.step(dt);
      if (previous !== this.sweeps.phase && (this.sweeps.phase === 'sweep-a' || this.sweeps.phase === 'sweep-b')) sound.play('chair-whoosh');
      const hits = this.sweeps.hit(this.player.body, this.targets.values());
      if (hits.length) { hits.forEach(box => this.spark(box)); this.pause.trigger(); break; }
      remaining -= dt;
    }
    if (this.sweeps.phase !== 'idle') {
      const frame = this.sweeps.phase + '-' + String(this.sweeps.frame).padStart(2, '0');
      if (this.scene.textures.get('chair-side').has(frame)) this.player.sprite.setTexture('chair-side', frame)
        .setFlipX((this.sweeps.direction < 0) !== (this.sweeps.phase === 'sweep-b'));
    }
    this.debug.clear();
    const box = this.sweeps.box(this.player.body);
    if (this.visible && box) this.debug.lineStyle(2, 0xff7835).strokeRect(box.x, box.y, box.w, box.h);
    this.label.setText('chair ' + this.sweeps.phase + ' ' + this.sweeps.frame + ' | hit-stop ' + this.pause.remaining.toFixed(0) + 'ms');
  }
}
