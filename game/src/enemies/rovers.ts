import { ACTOR_RIM, addRim } from '../stage/atmosphere/pipeline';
import type Phaser from 'phaser';
import type { CollisionChunk } from '../stage/collision';

type Spawn = CollisionChunk['world']['spawn'][number];
import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import type { Player } from '../player/player';
import type { ChairCombat } from '../combat/chair';
import { intersects, type Rect } from '../combat/sweeps';
import { gameEvents } from '../core/events';
import { sound } from '../fx/sound/Audio';
import type { ChairHit } from '../combat/sweeps';
import { Rover, ROVER_HEIGHT } from './rover';
import { Crab } from './crab';
import { Drone } from './drone';

/** What the stage needs from any small enemy model (rover, crab, drone). */
interface Model {
  x: number; y: number; health: number; phase: string; direction: -1 | 1; pose: string;
  bounds: Rect; step(seconds: number, hero?: { x: number; y: number }): boolean; hit(damage: number, direction: number): boolean;
  reset(): void;
}
interface Row { id: string; kind: 'rover' | 'crab' | 'drone'; model: Model; sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text;
  /** Extra reach that hurts (the crab's stab), and whether the body hurts right now (the drone only on its dive). */
  attack?: () => Rect | undefined; harmful: () => boolean; onBlocked?: () => void }

/** The atlas, the flip rule and the label height per kind. Rover and crab art face left; the drone faces right. */
/** Camera shake per event (ms, intensity): a chair hit landing on a small enemy, and its defeat. */
export const MOB_SHAKE = { hit: [70, 0.003], defeat: [140, 0.006] } as const;
/** The phases a defeated enemy plays before it is gone. */
const DEFEAT = new Set(['wreck', 'collapse', 'crash']);
/**
 * Whether a living small enemy's body hurts on contact. Never while it is knocked back by a chair hit or going
 * down – the hero who just landed a hit is not punished for standing where he swung. The drone only on its dive.
 */
export function harmfulPhase(kind: 'rover' | 'crab' | 'drone', phase: string): boolean {
  if (phase === 'hit' || DEFEAT.has(phase) || phase === 'dead') return false;
  return kind === 'drone' ? phase === 'dive' : true;
}

const KINDS = {
  rover: { atlas: 'enemy-rover', flip: (d: number) => d > 0, max: 3, sound: 'rover-motor' },
  crab: { atlas: 'enemy-crab', flip: (d: number) => d > 0, max: 4, sound: 'crab-servo' },
  drone: { atlas: 'enemy-drone', flip: () => false, max: 8, sound: 'drone-hum' },
} as const;

function patrolOf(spawn: Spawn): [number, number] {
  const range = spawn.patrol;
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] >= range[1]) {
    throw new Error(`Invalid patrol: ${spawn.id}`);
  }
  return range as [number, number];
}

/**
 * The region's small enemies from collision spawns (#45, P7): rovers patrol the decks and charge, crabs creep and
 * stab after raising their front legs, drones hover and dive when you pass under them. All take chair hits,
 * flash white, and reset when the hero respawns. F2 shows their state.
 */
export class Rovers {
  private rows: Row[];
  private debug: Phaser.GameObjects.Graphics;
  private visible = false;
  constructor(private scene: Phaser.Scene, private player: Player, chair: ChairCombat, chunks: CollisionChunk[]) {
    const cleanup: (() => void)[] = [];
    this.debug = scene.add.graphics().setDepth(10003);
    const spawns = chunks.flatMap(chunk => chunk.world.spawn);
    const make = (spawn: Spawn): Row | undefined => {
      const kind = spawn.kind as Row['kind'];
      if (!(kind in KINDS) || (kind !== 'rover' && !scene.textures.exists(KINDS[kind].atlas))) return undefined;
      const patrol = patrolOf(spawn);
      const at = { x: spawn.x, y: spawn.y };
      let row: Omit<Row, 'sprite' | 'label' | 'id' | 'kind'>;
      if (kind === 'rover') {
        const model = new Rover(at, patrol);
        row = { model, harmful: () => harmfulPhase('rover', model.phase), onBlocked: () => model.deflect(model.x >= this.player.body.x ? 1 : -1) };
      } else if (kind === 'crab') {
        const model = new Crab(at, patrol);
        row = { model, harmful: () => harmfulPhase('crab', model.phase), attack: () => model.attack };
      } else {
        const model = new Drone(at, patrol);
        row = { model, harmful: () => harmfulPhase('drone', model.phase) };
      }
      const model = row.model;
      const sprite = scene.add.sprite(model.x, model.y, KINDS[kind].atlas, model.pose).setOrigin(0.5, 1).setDepth(101);
      addRim(sprite, ACTOR_RIM.colour, ACTOR_RIM.strength);
      const label = scene.add.text(model.x, model.y - ROVER_HEIGHT - BODY_WIDTH / 2, '',
        { fontFamily: 'monospace', fontSize: '14px', backgroundColor: '#17242d' }).setDepth(102).setVisible(false);
      cleanup.push(chair.register({ id: spawn.id!, active: () => model.health > 0,
        bounds: () => model.bounds, hit: hit => this.struck(model, hit) }));
      cleanup.push(player.life.register(spawn.id!, () => model.reset()));
      return { ...row, id: spawn.id!, kind, sprite, label };
    };
    this.rows = spawns.map(make).filter((row): row is Row => !!row);
    const toggle = () => { this.visible = !this.visible; for (const row of this.rows) row.label.setVisible(this.visible); };
    scene.input.keyboard?.on('keydown-F2', toggle);
    scene.events.once('shutdown', () => { scene.input.keyboard?.off('keydown-F2', toggle); cleanup.forEach(off => off()); });
  }
  /** A chair hit on a small enemy: the model takes it; a landed one shakes the screen a touch (hit-stop is the chair's). */
  private struck(model: Model, hit: ChairHit): boolean {
    const landed = model.hit(hit.damage, hit.direction);
    if (landed) {
      const shake = model.health > 0 ? MOB_SHAKE.hit : MOB_SHAKE.defeat;
      this.scene.cameras.main.shake(shake[0], shake[1]);
      if (model.health === 0) this.burst(model.bounds);
    }
    return landed;
  }

  /** It goes down: dark scrap and a few sparks burst from its body. */
  private burst(box: Rect): void {
    const x = box.x + box.w / 2, y = box.y + box.h / 2, floor = box.y + box.h;
    for (let i = 0; i < 8; i++) {
      const bit = this.scene.add.rectangle(x, y, 3, 2 + (i % 2), i % 3 ? 0x23282c : 0xfff4cb).setDepth(110);
      const side = i % 2 ? 1 : -1;
      this.scene.tweens.add({ targets: bit, x: x + side * (8 + ((i * 29) % 26)), duration: 380, ease: 'Quad.easeOut' });
      this.scene.tweens.add({ targets: bit, y: floor - 1, duration: 380, ease: 'Back.easeIn',
        onComplete: () => this.scene.tweens.add({ targets: bit, alpha: 0, delay: 200, duration: 200, onComplete: () => bit.destroy() }) });
    }
  }

  update(milliseconds: number) {
    this.debug.clear();
    const body = this.player.body;
    const hero = { x: body.x - BODY_WIDTH / 2, y: body.y - BODY_HEIGHT, w: BODY_WIDTH, h: BODY_HEIGHT };
    for (const row of this.rows) {
      const { id, kind, model, sprite, label } = row;
      const before = model.phase;
      const defeated = model.step(milliseconds / 1000, this.player.life.dead === 0 ? body : undefined);
      if (defeated) gameEvents.emit('enemy-defeated', { id, kind, position: { x: model.x, y: model.y } });
      // The tells get a sound: the rover's motor revs up under its red lidar, the crab's servos as its legs rise,
      // the drone's hum as it tilts.
      if (before !== model.phase && model.phase === 'tell') sound.play(KINDS[kind].sound);
      if (this.scene.textures.get(KINDS[kind].atlas).has(model.pose)) sprite.setFrame(model.pose);
      sprite.setPosition(Math.round(model.x), Math.round(model.y)).setFlipX(KINDS[kind].flip(model.direction))
        .setVisible(model.phase !== 'dead' || kind !== 'drone');
      if (model.phase === 'hit') sprite.setTintFill(0xffffff);
      else if (model.phase === 'tell' && kind !== 'rover' && Math.floor(this.scene.time.now / 90) % 2 === 0) sprite.setTint(0xff8a7a);
      else sprite.clearTint();
      if (model.health > 0 && row.harmful()) {
        const reach = row.attack?.();
        if (intersects(model.bounds, hero) || (reach && intersects(reach, hero))) this.player.damage(1, model.x, row.onBlocked);
      }
      label.setPosition(model.x, model.y - ROVER_HEIGHT - BODY_WIDTH / 2).setText(`${id} ${model.health}/${KINDS[kind].max} ${model.phase}`);
      if (this.visible && model.health > 0) {
        const box = model.bounds;
        this.debug.lineStyle(1, 0xff7835).strokeRect(box.x, box.y, box.w, box.h);
        const reach = row.attack?.();
        if (reach) this.debug.lineStyle(1, 0xff3030).strokeRect(reach.x, reach.y, reach.w, reach.h);
      }
    }
  }
}
