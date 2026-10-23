import Phaser from 'phaser';
import type { CollisionChunk } from '../stage/collision';
import { BODY_HEIGHT, BODY_WIDTH, overlaps, stepBody, type Body } from './body';
import { horizontal, move, movement } from './movement';
import { jump, jumpState, landing } from './jump';
import { climb, dropThrough, traversal } from './traversal';
import { catalogue, LocomotionAnimation, type MotionPose } from './animation';
import { gameEvents } from '../core/events';
import { Life } from '../combat/life';
import { deathDust, lifePose, paintLife } from '../combat/life-visuals';

export class Player {
  readonly body: Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly life: Life;
  onHealthChanged: (health: number) => void = () => {};
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
  get canAttack() { return this.traversal.ladder === null && this.life.dead === 0 && this.life.knock === 0; }
  constructor(private scene: Phaser.Scene, private chunks: CollisionChunk[],
    private region = 'rusty-creek', bosses = new Set<string>()) {
    this.spawn = chunks.flatMap(c => c.world.spawn).find(p => p.kind === 'player') ?? { x: 120, y: 461 };
    this.body = { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, grounded: true };
    this.life = new Life(this.body, bosses);
    this.air = jumpState(this.body.y);
    this.animation = new LocomotionAnimation(catalogue(Object.fromEntries(
      ['hero-move', 'hero-run', 'hero-idle', 'hero-air'].map(board => [board, scene.cache.json.get(`${board}.anims`)]))));
    this.sprite = scene.add.sprite(this.body.x, this.body.y, 'hero-move', 'idle-00').setOrigin(0.5, 1).setDepth(100);
    this.keys = scene.input.keyboard!.addKeys('A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE,K') as Record<string, Phaser.Input.Keyboard.Key>;
    this.debug = scene.add.graphics().setDepth(10001);
    this.label = scene.add.text(20, 135, '', { fontFamily: 'monospace', fontSize: '18px', backgroundColor: '#17242d' })
      .setScrollFactor(0).setDepth(10002).setVisible(false);
    const toggle = () => { this.showDebug = !this.showDebug; this.label.setVisible(this.showDebug); };
    scene.input.keyboard?.on('keydown-F2', toggle);
    scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown-F2', toggle));
    const offBoss = gameEvents.on('boss-defeated', ({ id }) => this.life.defeatedBosses.add(id));
    scene.events.once('shutdown', offBoss);
    if (import.meta.env.DEV) {
      scene.input.keyboard?.addCapture('F5');
      const hit = (event: KeyboardEvent) => {
        if (event.repeat) return;
        if (event.altKey) this.resetFromDanger();
        else if (event.ctrlKey) this.resetFromDanger(1);
        else this.damage(event.shiftKey ? 2 : 1, this.body.x - 10);
      };
      scene.input.keyboard?.on('keydown-F5', hit);
      scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown-F5', hit));
    }
  }
  damage(amount: number, sourceX: number) {
    if (!this.life.hit(amount, this.body.x >= sourceX ? 1 : -1)) return false;
    const position = { x: this.body.x, y: this.body.y };
    gameEvents.emit('player-hit', { health: this.life.health, damage: amount, position });
    if (this.life.dead > 0) {
      gameEvents.emit('player-died', { position });
      this.scene.time.delayedCall(600, () => deathDust(this.scene, position));
    } else this.body.vy = -90;
    return true;
  }
  heal(amount: number) {
    if (this.life.heal(amount)) this.onHealthChanged(this.life.health);
  }
  saveCheckpoint(id: string) {
    if (!this.life.save(this.body)) return;
    this.onHealthChanged(this.life.health);
    gameEvents.emit('save', { checkpoint: id, region: this.region, position: { x: this.body.x, y: this.body.y } });
  }
  private resetPosition(position: { x: number; y: number }) {
    Object.assign(this.body, position, { vx: 0, vy: 0, grounded: true, sliding: false, slope: 0 });
    this.motion = movement(); this.air = jumpState(this.body.y); this.traversal = traversal();
  }
  private resetFromDanger(damage = 0) {
    if (damage) this.damage(damage, this.body.x - 10);
    if (this.life.dead === 0) this.resetPosition(this.life.resetSafe());
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
      const lifeStep = this.life.tick(dt);
      if (lifeStep.respawned) {
        this.resetPosition(this.life.checkpoint);
        this.onHealthChanged(this.life.health);
      }
      if (this.life.dead > 0) { remaining -= dt; continue; }
      const knocked = lifeStep.dx !== 0;
      const pressed = jumpDown && !this.air.wasDown;
      const dropped = !knocked && vertical > 0 && pressed && dropThrough(this.body, this.traversal, geometry);
      const climbing = !knocked && climb(this.body, this.traversal, geometry, vertical, axis, pressed, dt);
      const wasGrounded = this.body.grounded;
      if (knocked) {
        this.body.vx = lifeStep.dx / dt;
        this.traversal = traversal(); this.air.wasDown = jumpDown;
        this.air.buffer = 0; this.air.coyote = 0; this.air.active = false;
        this.motion = { ...movement(), facing: this.motion.facing };
      } else if (dropped || climbing) {
        this.air.wasDown = jumpDown; this.air.buffer = 0; this.air.coyote = 0; this.air.active = false;
        this.motion = movement();
      } else {
        move(this.motion, axis, dt);
        if (!this.body.sliding) this.body.vx = this.motion.vx;
        jump(this.body, this.air, jumpDown, dt);
      }
      if (!climbing) stepBody(this.body, geometry, dt, this.traversal.drop > 0);
      landing(this.body, this.air, wasGrounded, dt);
      if (lifeStep.knockFinished) this.body.vx = 0;
      this.motion.vx = this.body.vx;
      remaining -= dt;
    }
    if (this.life.dead === 0) {
      const hazard = geometry.flatMap(g => g.hazard).find(box => overlaps(this.body, box));
      const noGo = this.body.y > 900 || geometry.some(g => g.noGo.some(box => overlaps(this.body, box)));
      if (hazard) this.resetFromDanger(Number(hazard.damage) || 1);
      else if (noGo) this.resetFromDanger();
      else if (this.body.grounded && this.life.knock === 0) this.life.rememberSafe(this.body);
    }
    const desired: MotionPose = this.traversal.ladder ? 'ladder' : this.air.landing > 0
      ? this.air.hard ? 'hard-landing' : 'land' : this.body.sliding ? 'fall'
      : !this.body.grounded ? this.body.vy < 0 ? 'jump' : 'fall'
      : Math.abs(this.body.vx) > 180 ? 'run' : Math.abs(this.body.vx) > 5 ? 'walk' : 'idle';
    const locomotion = this.animation.update(desired, desired === 'ladder' && vertical === 0 ? 0 : milliseconds / 1000);
    const pose = lifePose(this.life) ?? locomotion;
    if (this.scene.textures.get(pose.board).has(pose.frame)) this.sprite.setTexture(pose.board, pose.frame);
    else this.sprite.setTexture('hero-move', 'idle-00');
    this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y)).setFlipX(this.motion.facing < 0);
    paintLife(this.sprite, this.life, this.scene.time.now);
    if (axis) this.lastSpeed = Math.abs(this.body.vx);
    this.debug.clear();
    if (this.showDebug) this.debug.lineStyle(2, 0xffffff).strokeRect(this.body.x - BODY_WIDTH / 2,
      this.body.y - BODY_HEIGHT, BODY_WIDTH, BODY_HEIGHT);
    this.label.setText([
      'hp ' + this.life.health + '/5 | invulnerable ' + this.life.invulnerable.toFixed(2) + 's',
      `vx ${this.body.vx.toFixed(1)} px/s | last ${this.lastSpeed.toFixed(1)} (${(this.lastSpeed / 43).toFixed(2)} m/s)`,
      `held ${this.motion.held.toFixed(2)}s | x ${this.body.x.toFixed(1)} y ${this.body.y.toFixed(1)}`,
      `jump ${this.air.height.toFixed(1)}px | ${this.traversal.ladder ? 'climb' : this.body.sliding ? 'slide' : 'walk'} slope ${(Math.atan(this.body.slope ?? 0) * 180 / Math.PI).toFixed(1)}°`,
      `anim ${this.animation.clip} | ${pose.frame} | land ${this.air.hard ? 'hard' : 'normal'}`,
    ]);
  }
}
