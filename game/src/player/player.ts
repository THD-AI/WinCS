import Phaser from 'phaser';
import type { CollisionChunk } from '../stage/collision';
import { BODY_HEIGHT, BODY_WIDTH, overlaps, stepBody, type Body } from './body';
import { horizontal, move, movement } from './movement';
import { jump, jumpState, landing } from './jump';

export class Player {
  readonly body: Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private motion = movement();
  private keys;
  private debug: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private showDebug = false;
  private lastSpeed = 0;
  private spawn;
  private air;
  constructor(private scene: Phaser.Scene, private chunks: CollisionChunk[]) {
    this.spawn = chunks.flatMap(c => c.world.spawn).find(p => p.kind === 'player') ?? { x: 120, y: 461 };
    this.body = { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, grounded: true };
    this.air = jumpState(this.body.y);
    this.sprite = scene.add.sprite(this.body.x, this.body.y, 'hero-move', 'idle-00').setOrigin(0.5, 1).setDepth(100);
    this.keys = scene.input.keyboard!.addKeys('A,D,LEFT,RIGHT,SPACE,K') as Record<string, Phaser.Input.Keyboard.Key>;
    this.debug = scene.add.graphics().setDepth(10001);
    this.label = scene.add.text(20, 80, '', { fontFamily: 'monospace', fontSize: '18px', backgroundColor: '#17242d' })
      .setScrollFactor(0).setDepth(10002).setVisible(false);
    const toggle = () => { this.showDebug = !this.showDebug; this.label.setVisible(this.showDebug); };
    scene.input.keyboard?.on('keydown-F2', toggle);
    scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown-F2', toggle));
  }
  update(milliseconds: number) {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const axis = horizontal(this.keys.A.isDown || this.keys.LEFT.isDown, this.keys.D.isDown || this.keys.RIGHT.isDown,
      pad?.leftStick.x, pad?.left, pad?.right);
    const jumpDown = this.keys.SPACE.isDown || this.keys.K.isDown || !!pad?.A;
    // Substeps keep wall and floor contacts stable during slow rendered frames.
    let remaining = Math.min(milliseconds / 1000, 0.1);
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120);
      move(this.motion, axis, dt);
      if (!this.body.sliding) this.body.vx = this.motion.vx;
      jump(this.body, this.air, jumpDown, dt);
      const wasGrounded = this.body.grounded;
      stepBody(this.body, this.chunks.map(c => c.world), dt);
      landing(this.body, this.air, wasGrounded, dt);
      this.motion.vx = this.body.vx;
      remaining -= dt;
    }
    if (this.body.y > 900 || this.chunks.some(c => c.world.noGo.some(box => overlaps(this.body, box)))) {
      Object.assign(this.body, { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, grounded: true, sliding: false, slope: 0 });
      this.motion = movement();
      this.air = jumpState(this.body.y);
    }
    const pose = this.air.landing > 0 ? this.air.hard
      ? `hard-landing-${String(Math.min(3, Math.floor((4 / 12 - this.air.landing) * 12))).padStart(2, '0')}`
      : 'jump-08' : this.body.sliding ? `fall-${String(Math.floor(this.scene.time.now * 12 / 1000) % 3).padStart(2, '0')}`
      : !this.body.grounded ? this.body.vy < 0 ? 'jump-02' : 'fall-00' : null;
    if (pose && this.scene.textures.get('hero-air').has(pose)) this.sprite.setTexture('hero-air', pose);
    else this.sprite.setTexture('hero-move', 'idle-00');
    this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y)).setFlipX(this.motion.facing < 0);
    if (axis) this.lastSpeed = Math.abs(this.body.vx);
    this.debug.clear();
    if (this.showDebug) this.debug.lineStyle(2, 0xffffff).strokeRect(this.body.x - BODY_WIDTH / 2,
      this.body.y - BODY_HEIGHT, BODY_WIDTH, BODY_HEIGHT);
    this.label.setText(`vx ${this.body.vx.toFixed(1)} px/s | last ${this.lastSpeed.toFixed(1)} (${(this.lastSpeed / 43).toFixed(2)} m/s)\nheld ${this.motion.held.toFixed(2)}s | x ${this.body.x.toFixed(1)} y ${this.body.y.toFixed(1)}\njump ${this.air.height.toFixed(1)}px | ${this.body.sliding ? 'slide' : 'walk'} slope ${(Math.atan(this.body.slope ?? 0) * 180 / Math.PI).toFixed(1)}°`);
  }
}
