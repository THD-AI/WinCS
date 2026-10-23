import Phaser from 'phaser';
import type { CollisionChunk } from '../stage/collision';
import { BODY_HEIGHT, BODY_WIDTH, overlaps, stepBody, type Body } from './body';
import { horizontal, move, movement } from './movement';
import { jump, jumpState, landing } from './jump';
import { climb, dropThrough, traversal } from './traversal';
import { catalogue, LocomotionAnimation, type MotionPose } from './animation';

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
  private traversal = traversal();
  private animation: LocomotionAnimation;
  get canAttack() { return this.traversal.ladder === null; }
  constructor(private scene: Phaser.Scene, private chunks: CollisionChunk[]) {
    this.spawn = chunks.flatMap(c => c.world.spawn).find(p => p.kind === 'player') ?? { x: 120, y: 461 };
    this.body = { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, grounded: true };
    this.air = jumpState(this.body.y);
    this.animation = new LocomotionAnimation(catalogue(Object.fromEntries(
      ['hero-move', 'hero-run', 'hero-idle', 'hero-air'].map(board => [board, scene.cache.json.get(`${board}.anims`)]))));
    this.sprite = scene.add.sprite(this.body.x, this.body.y, 'hero-move', 'idle-00').setOrigin(0.5, 1).setDepth(100);
    this.keys = scene.input.keyboard!.addKeys('A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE,K') as Record<string, Phaser.Input.Keyboard.Key>;
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
    const vertical = horizontal(this.keys.W.isDown || this.keys.UP.isDown, this.keys.S.isDown || this.keys.DOWN.isDown,
      pad?.leftStick.y, pad?.up, pad?.down);
    const geometry = this.chunks.map(c => c.world);
    // Substeps keep wall and floor contacts stable during slow rendered frames.
    let remaining = Math.min(milliseconds / 1000, 0.1);
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120);
      const pressed = jumpDown && !this.air.wasDown;
      const dropped = vertical > 0 && pressed && dropThrough(this.body, this.traversal, geometry);
      const climbing = climb(this.body, this.traversal, geometry, vertical, axis, pressed, dt);
      const wasGrounded = this.body.grounded;
      if (dropped || climbing) {
        this.air.wasDown = jumpDown; this.air.buffer = 0; this.air.coyote = 0; this.air.active = false;
        this.motion = movement();
      } else {
        move(this.motion, axis, dt);
        if (!this.body.sliding) this.body.vx = this.motion.vx;
        jump(this.body, this.air, jumpDown, dt);
      }
      if (!climbing) stepBody(this.body, geometry, dt, this.traversal.drop > 0);
      landing(this.body, this.air, wasGrounded, dt);
      this.motion.vx = this.body.vx;
      remaining -= dt;
    }
    if (this.body.y > 900 || this.chunks.some(c => c.world.noGo.some(box => overlaps(this.body, box)))) {
      Object.assign(this.body, { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, grounded: true, sliding: false, slope: 0 });
      this.motion = movement();
      this.air = jumpState(this.body.y);
      this.traversal = traversal();
    }
    const desired: MotionPose = this.traversal.ladder ? 'ladder' : this.air.landing > 0
      ? this.air.hard ? 'hard-landing' : 'land' : this.body.sliding ? 'fall'
      : !this.body.grounded ? this.body.vy < 0 ? 'jump' : 'fall'
      : Math.abs(this.body.vx) > 180 ? 'run' : Math.abs(this.body.vx) > 5 ? 'walk' : 'idle';
    const pose = this.animation.update(desired, desired === 'ladder' && vertical === 0 ? 0 : milliseconds / 1000);
    if (this.scene.textures.get(pose.board).has(pose.frame)) this.sprite.setTexture(pose.board, pose.frame);
    else this.sprite.setTexture('hero-move', 'idle-00');
    this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y)).setFlipX(this.motion.facing < 0);
    if (axis) this.lastSpeed = Math.abs(this.body.vx);
    this.debug.clear();
    if (this.showDebug) this.debug.lineStyle(2, 0xffffff).strokeRect(this.body.x - BODY_WIDTH / 2,
      this.body.y - BODY_HEIGHT, BODY_WIDTH, BODY_HEIGHT);
    this.label.setText([
      `vx ${this.body.vx.toFixed(1)} px/s | last ${this.lastSpeed.toFixed(1)} (${(this.lastSpeed / 43).toFixed(2)} m/s)`,
      `held ${this.motion.held.toFixed(2)}s | x ${this.body.x.toFixed(1)} y ${this.body.y.toFixed(1)}`,
      `jump ${this.air.height.toFixed(1)}px | ${this.traversal.ladder ? 'climb' : this.body.sliding ? 'slide' : 'walk'} slope ${(Math.atan(this.body.slope ?? 0) * 180 / Math.PI).toFixed(1)}°`,
      `anim ${this.animation.clip} | ${pose.frame} | land ${this.air.hard ? 'hard' : 'normal'}`,
    ]);
  }
}
