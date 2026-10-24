import Phaser from 'phaser';
import type { CollisionChunk, Box } from '../stage/collision';
import { BODY_HEIGHT, BODY_WIDTH, overlaps, stepBody, type Body } from './body';
import { horizontal, move, movement, RUN_SPEED, WALK_SPEED } from './movement';
import { jump, jumpState, JUMP_SPEED, landing, LANDING_TIMES, pogo, type LandingTimes } from './jump';
import { climb, climbFlip, dropThrough, surfaceNear, traversal } from './traversal';
import { catalogue, clipLength, LocomotionAnimation, type Catalogue, type MotionPose } from './animation';
import { gameEvents } from '../core/events';
import { Life } from '../combat/life';
import { deathDust } from '../combat/life-visuals';
import type { StageManifest, RegionState } from '../stage/manifest';
import { FALLBACK, loadSurfaces, parseSurfaces, SurfaceMap, type Puff, type Surface } from './surfaces';
import { blades, Grounding } from './grounding';
import { footfalls } from './footfall';
import { spawnPuff, type PuffKind } from './dust';
import { HurtAnimation } from './hurt';
import type { Position } from '../core/events';
import { Interaction } from './interaction';
import { HeroSlices, PonchoSway } from './idle-life';
import { parseAtmosphere, type Wind } from '../stage/atmosphere/config';
import { ACTOR_RIM, addRim } from '../stage/atmosphere/pipeline';
import { dataKey } from '../boot/manifest';
import { GuardPush } from '../combat/guard';
import { CODES, physicalKeys } from './physicalKeys';
import { Dodge } from './dodge';

/** The splash of a region without a `water` material. */
const SPLASH: Puff = { sprite: 'splash', shape: 'dust', colors: ['#9cc8f0', '#e8f4ff', '#4f86c6'], count: 8 };

export class Player {
  readonly body: Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly life: Life;
  onHealthChanged: (health: number) => void = () => {};
  onHazards: (boxes: Box[]) => boolean = () => false;
  onGuard: (damage: number, sourceX: number) => boolean = () => false;
  private guardPush = new GuardPush();
  /** The dodge-dash (dodge.ts); `dodgeWas` is last frame's button, `ghost` the time to the next after-image. */
  readonly dodge = new Dodge();
  private dodgeWas = false;
  private ghost = 0;
  private motion = movement();
  private keys;
  private physical: { any(codes: readonly string[]): boolean };
  private debug: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private showDebug = false;
  private lastSpeed = 0;
  private spawn;
  private air;
  private traversal = traversal();
  private animation: LocomotionAnimation;
  private interaction = new Interaction();
  private clips: Catalogue;
  private landingTimes: LandingTimes = LANDING_TIMES;
  private surfaces: SurfaceMap | null = null;
  private surface: Surface = FALLBACK;
  private grounding = new Grounding();
  private footfalls: Record<string, number[]> = {};
  private lastFrame = '';
  private landed: PuffKind | null = null;
  private blades: Phaser.GameObjects.Graphics;
  private hurt: HurtAnimation;
  private groundOffset = { offset: 0, cover: 0 };
  private slices: HeroSlices;
  private sway = new PonchoSway();
  private wind: Wind | null = null;
  private idleLife = { breath: 0, sway: 0 };
  get canAttack() { return this.traversal.ladder === null && this.life.dead === 0 && this.life.knock === 0 && !this.interaction.active && !this.dodge.active; }
  get facing() { return this.motion.facing; }
  constructor(private scene: Phaser.Scene, private chunks: CollisionChunk[],
    private region: string, bosses = new Set<string>(), spawnOverride?: Position) {
    const spawn = spawnOverride ?? chunks.flatMap(c => c.world.spawn).find(p => p.kind === 'player') ?? { x: 120, y: 461 };
    // An authored spawn a pixel or two off its walk line would start inside the ground and fall through it:
    // stand it on the surface it was meant for.
    this.spawn = { ...spawn, y: surfaceNear(chunks.map(c => c.world), spawn.x, spawn.y) };
    this.body = { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, grounded: true };
    this.life = new Life(this.body, bosses);
    this.air = jumpState(this.body.y);
    this.clips = catalogue(Object.fromEntries(
      ['hero-move', 'hero-run', 'hero-idle', 'hero-air'].map(board => [board, scene.cache.json.get(`${board}.anims`)])));
    this.animation = new LocomotionAnimation(this.clips);
    if (this.clips.land && this.clips['hard-landing']) this.landingTimes = {
      soft: clipLength(this.clips.land, 'land'), hard: clipLength(this.clips['hard-landing'], 'hard-landing') };
    this.footfalls = footfalls(scene, this.clips);
    this.hurt = new HurtAnimation(scene.cache.json.get('hero-hurt.anims') ?? {}, scene.cache.json.get('hero-death.anims') ?? {});
    this.sprite = scene.add.sprite(this.body.x, this.body.y, 'hero-move', 'idle-00').setOrigin(0.5, 1).setDepth(100);
    this.slices = new HeroSlices(scene, this.sprite);
    for (const sprite of [this.sprite, ...this.slices.parts]) addRim(sprite, ACTOR_RIM.colour, ACTOR_RIM.strength);
    this.blades = scene.add.graphics().setDepth(101);
    // After every scene update (the chair may swap the hero's frame): place the feet in the ground.
    const settle = () => this.settle();
    scene.events.on('postupdate', settle);
    scene.events.once('shutdown', () => scene.events.off('postupdate', settle));
    this.keys = scene.input.keyboard!.addKeys('A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE,K,Z,J,X,L,C,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.physical = physicalKeys(scene);
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
  damage(amount: number, sourceX: number, onBlocked?: () => void) {
    if (this.life.dead > 0 || this.life.invulnerable > 1e-9 || this.dodge.invulnerable) return false;
    if (this.onGuard(amount, sourceX)) { onBlocked?.(); return false; }
    if (!this.life.hit(amount, this.body.x >= sourceX ? 1 : -1)) return false;
    this.guardPush.cancel();
    this.dodge.cancel();
    this.interaction.cancel();
    this.hurt.start(amount);
    const position = { x: this.body.x, y: this.body.y };
    gameEvents.emit('player-hit', { health: this.life.health, damage: amount, position });
    if (this.life.dead > 0) {
      gameEvents.emit('player-died', { position });
      this.scene.time.delayedCall(600, () => deathDust(this.scene, position));
    } else this.body.vy = -90;
    return true;
  }
  /**
   * The region's ground materials (surfaces.json). `data` comes from Preload; when it is absent the file is
   * fetched here, and a region without one keeps the fallback (stone-like, 1 px).
   */
  ground(manifest: StageManifest, state: RegionState, data?: unknown) {
    // The poncho sways with the region's own wind (atmosphere.json, the defaults without one).
    this.wind = parseAtmosphere(this.scene.cache.json.get(dataKey(manifest.region, 'atmosphere')) ?? {}, state).atmosphere.wind;
    const use =(parsed: ReturnType<typeof parseSurfaces> | null) => { this.surfaces = new SurfaceMap(parsed, manifest, state); };
    if (data && typeof data === 'object' && Object.keys(data).length) {
      try { use(parseSurfaces(data)); return; } catch (error) { console.error(error); }
    }
    use(null);
    void loadSurfaces(manifest.region).then(parsed => { if (parsed) use(parsed); });
  }
  heal(amount: number) {
    if (this.life.heal(amount)) this.onHealthChanged(this.life.health);
  }
  saveCheckpoint(id: string) {
    if (!this.life.save(this.body)) return;
    this.onHealthChanged(this.life.health);
    gameEvents.emit('save', { checkpoint: id, region: this.region, position: { x: this.body.x, y: this.body.y } });
  }
  beginInteraction(name = 'interact') {
    if (!this.canAttack || !this.body.grounded) return false;
    const clip = this.scene.cache.json.get('hero-hurt.anims')[name];
    if (!clip) return false;
    this.interaction.begin(clip, name);
    this.motion = { ...movement(), facing: this.motion.facing }; this.body.vx = 0; this.body.vy = 0;
    return true;
  }
  pogo(top: number) { this.air = pogo(this.body, top); this.sprite.setPosition(Math.round(this.body.x), top); }
  pushGuard(direction: number) {
    this.guardPush.start(direction); this.body.vx = 0;
    this.motion = { ...movement(), facing: this.motion.facing };
  }
  private resetPosition(position: { x: number; y: number }) {
    this.guardPush.cancel();
    position = { ...position, y: surfaceNear(this.chunks.map(c => c.world), position.x, position.y) };
    Object.assign(this.body, position, { vx: 0, vy: 0, grounded: true, sliding: false, slope: 0 });
    this.motion = movement(); this.air = jumpState(this.body.y); this.traversal = traversal(); this.dodge.cancel();
  }
  private resetFromDanger(damage = 0) {
    if (damage) this.damage(damage, this.body.x - 10);
    if (this.life.dead === 0) this.resetPosition(this.life.resetSafe());
  }
  update(milliseconds: number) {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const interacting = this.interaction.active;
    const interactionPose = this.interaction.step(milliseconds / 1000);
    // Phaser's keys (keyCode) or the physical key (code): WASD works on any layout and with an input method active.
    const key = (codes: readonly string[], ...names: string[]) => names.some(name => this.keys[name].isDown) || this.physical.any(codes);
    const axis = interacting ? 0 : horizontal(key(CODES.left, 'A', 'LEFT'), key(CODES.right, 'D', 'RIGHT'),
      pad?.leftStick.x, pad?.left, pad?.right);
    const jumpDown = !interacting && (key(CODES.jump, 'SPACE', 'K', 'Z') || !!pad?.A);
    const vertical = interacting || key(CODES.attack, 'J', 'X') || pad?.X ? 0 : horizontal(key(CODES.up, 'W', 'UP'), key(CODES.down, 'S', 'DOWN'),
      pad?.leftStick.y, pad?.up, pad?.down);
    const dodgeDown = !interacting && (key(CODES.dodge, 'L', 'C', 'SHIFT') || !!pad?.B || !!pad?.R1);
    let dodgePressed = dodgeDown && !this.dodgeWas;
    this.dodgeWas = dodgeDown;
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
      const shove = this.guardPush.step(dt);
      const knocked = lifeStep.dx !== 0 || shove !== 0;
      if (dodgePressed && !knocked && this.canAttack && this.guardPush.remaining === 0) {
        // The way the stick points, else the way he faces.
        const direction = axis ? (Math.sign(axis) as -1 | 1) : this.motion.facing;
        if (this.dodge.start(direction, this.body.grounded)) { this.motion.facing = direction; this.dodgeBurst(); }
      }
      dodgePressed = false;
      if (knocked) this.dodge.cancel();
      const dashing = this.dodge.active;
      const dash = this.dodge.step(dt);
      const pressed = jumpDown && !this.air.wasDown;
      const dropped = !knocked && !dashing && vertical > 0 && pressed && dropThrough(this.body, this.traversal, geometry);
      const climbing = !knocked && !dashing && climb(this.body, this.traversal, geometry, vertical, axis, pressed, dt);
      const wasGrounded = this.body.grounded;
      if (dashing) {
        // Straight across at the dash speed, holding the height; a Jump pressed now is taken when it ends.
        this.body.vx = dash / dt; this.body.vy = 0;
        if (!this.dodge.active) this.body.vx = Math.sign(dash) * Math.min(Math.abs(this.body.vx), RUN_SPEED);
      } else if (knocked) {
        this.body.vx = (lifeStep.dx || shove) / dt;
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
      if (this.body.grounded) this.dodge.land();
      landing(this.body, this.air, wasGrounded, dt, this.landingTimes);
      if (!wasGrounded && this.body.grounded && !climbing && !dropped) this.landed = this.air.hard ? 'hard-land' : 'land';
      if (lifeStep.knockFinished || shove !== 0 && this.guardPush.remaining === 0) this.body.vx = 0;
      this.motion.vx = this.body.vx;
      remaining -= dt;
    }
    if (this.life.dead === 0) {
      const hazards = geometry.flatMap(g => g.hazard);
      const bounced = this.onHazards(hazards);
      const hazard = hazards.find(box => overlaps(this.body, box));
      // Water is never floor: falling in splashes and puts the hero back on the bank he last stood on.
      const water = geometry.flatMap(g => g.noGo).find(box => box.kind === 'water' && overlaps(this.body, box));
      const noGo = this.body.y > 900 || geometry.some(g => g.noGo.some(box => overlaps(this.body, box)));
      if (hazard && !bounced) this.resetFromDanger(Number(hazard.damage) || 1);
      else if (noGo) {
        if (!water && this.body.y > 900) gameEvents.emit('fell-out', { region: this.region,
          position: { x: this.body.x, y: this.body.y }, lastSafe: { x: Math.round(this.life.safe.x), y: Math.round(this.life.safe.y) } });
        if (water) spawnPuff(this.scene, this.body.x, water.y, this.surfaces?.named('water')?.material.puff ?? SPLASH, 'hard-land', 1);
        this.resetFromDanger();
      }
      else if (this.body.grounded && this.life.knock === 0) this.life.rememberSafe(this.body);
    }
    const desired: MotionPose = this.traversal.ladder ? 'ladder' : this.air.landing > 0
      ? this.air.hard ? 'hard-landing' : 'land' : this.body.sliding ? 'fall'
      : !this.body.grounded ? this.body.vy < 0 ? 'jump' : 'fall'
      : Math.abs(this.body.vx) > (WALK_SPEED + RUN_SPEED) / 2 ? 'run' : Math.abs(this.body.vx) > 5 ? 'walk' : 'idle';
    this.animation.wounded = this.life.health <= 2;
    const locomotion = this.animation.update(desired, desired === 'ladder' && vertical === 0 ? 0 : milliseconds / 1000,
      Math.abs(this.body.vx), { vy: this.body.vy, launch: JUMP_SPEED });
    const hurtPose = this.hurt.update(this.life, milliseconds / 1000, axis !== 0 || !this.body.grounded);
    const pose = hurtPose ?? interactionPose ?? locomotion;
    const standing = pose === locomotion && this.animation.standing && this.body.grounded && this.life.dead === 0;
    this.idleLife = { breath: standing ? this.animation.breath : 0,
      sway: this.sway.update(this.wind, this.body.x, this.scene.game.loop.time / 1000, milliseconds / 1000, standing) };
    if (this.scene.textures.get(pose.board).has(pose.frame)) this.sprite.setTexture(pose.board, pose.frame);
    else this.sprite.setTexture('hero-move', 'idle-00');
    this.sprite.setFlipX(this.traversal.ladder && pose === locomotion ? climbFlip(this.body.y) : this.motion.facing < 0).setAlpha(this.hurt.alpha(this.life, this.scene.time.now));
    if (this.dodge.active) this.dodgePose(milliseconds / 1000);
    this.feel(pose, milliseconds / 1000);
    this.settle();
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
      `ground ${this.surface.name} | sink ${this.groundOffset.offset}px | cover ${this.groundOffset.cover}`,
    ]);
  }
  /** The dash's start: a puff off the ground behind him (none in the air). */
  private dodgeBurst() {
    this.ghost = 0;
    if (this.body.grounded) spawnPuff(this.scene, this.body.x, this.body.y, this.surface.material.puff, 'land', -this.dodge.direction);
  }
  /**
   * The dash pose: no new art – a run stride held, leaning into the dash, with fading after-images drawn behind
   * it every 0.04 s (cool tint, additive) so the burst and its direction read at a glance.
   */
  private dodgePose(dt: number) {
    const frame = 'run-02';
    if (this.scene.textures.get('hero-run').has(frame)) this.sprite.setTexture('hero-run', frame);
    this.sprite.setFlipX(this.dodge.direction < 0).setAlpha(1);
    this.ghost -= dt;
    if (this.ghost > 0) return;
    this.ghost = 0.04;
    const after = this.scene.add.image(Math.round(this.body.x), Math.round(this.body.y), this.sprite.texture.key, this.sprite.frame.name)
      .setOrigin(0.5, 1).setFlipX(this.sprite.flipX).setDepth(this.sprite.depth - 1).setTint(0x9fd8ff).setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: after, alpha: 0, duration: 180, ease: 'Quad.easeOut', onComplete: () => after.destroy() });
  }
  /** Surface under the feet, the sink it asks for, and the puffs of footfalls and landings. */
  private feel(pose: { board: string; frame: string }, dt: number) {
    const grounded = this.body.grounded && this.traversal.ladder === null && this.life.dead === 0;
    this.surface = this.surfaces?.at(this.body.x, this.body.y) ?? FALLBACK;
    const hard = this.air.hard;
    const left = this.air.landing / Math.max(1e-6, hard ? this.landingTimes.hard : this.landingTimes.soft);
    this.groundOffset = this.grounding.update({ material: this.surface.material, grounded,
      slope: this.body.slope ?? 0, landing: left, hard }, dt);
    const puff = this.surface.material.puff;
    if (this.landed) {
      spawnPuff(this.scene, this.body.x, this.body.y, puff, this.landed, this.motion.facing);
      this.landed = null;
    } else if (grounded && pose.frame !== this.lastFrame) {
      const clip = pose.frame.slice(0, -3), n = Number(pose.frame.slice(-2));
      // The planted foot is ahead of the hip at heel strike: the puff comes off that foot.
      if (this.footfalls[clip]?.includes(n)) spawnPuff(this.scene, this.body.x + this.motion.facing * 4, this.body.y,
        puff, 'step', this.body.vx || this.motion.facing);
    }
    this.lastFrame = pose.frame;
  }
  /** Runs after the player's and every later update: the feet sink, the ground covers their lowest rows, tufts stand in front. */
  private settle() {
    const { offset, cover } = this.groundOffset;
    this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y) + offset);
    // Breath and poncho only on the hero's own standing frames (a chair pose swapped in later is drawn whole).
    const own = this.sprite.texture.key === 'hero-move' || this.sprite.texture.key === 'hero-idle';
    this.slices.apply(own ? this.idleLife.breath : 0, own ? this.idleLife.sway : 0, cover);
    this.blades.clear();
    const colors = this.surface.material.blades;
    if (!colors?.length || cover === 0) return;
    const ground = Math.round(this.body.y) + offset - cover;
    for (const blade of blades(Math.round(this.body.x), 12, cover, colors.length)) {
      this.blades.fillStyle(Number.parseInt(colors[blade.color].slice(1), 16), 1)
        .fillRect(blade.x, ground + cover - blade.height, 1, blade.height);
    }
  }
}
