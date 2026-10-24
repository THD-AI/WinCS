import Phaser from 'phaser';
import { Assets, BOARDS } from '../stage/assets';
import { drawStage } from '../stage/render';
import type { StageManifest, RegionState } from '../stage/manifest';
import { loadCollisions, type CollisionChunk } from '../stage/collision';
import { collisionDebug } from '../stage/collision-debug';
import { Player } from '../player/player';
import { cameraFollow } from '../stage/camera';
import { ChairCombat } from '../combat/chair';
import { CoffeePoints } from '../combat/coffee';
import { Rovers } from '../enemies/rovers';
import { JennyBoss } from '../enemies/jennyBoss';
import { BODY_WIDTH } from '../player/body';
import { Triggers } from '../stage/triggers';
import { START, type RegionTarget } from '../stage/swap';
import type { Position } from './events';

// Bootstrap-only scenes live in lane B until lane A provides story/UI scenes.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { this.scene.start('Preload'); }
}

export class Preload extends Phaser.Scene {
  constructor() { super('Preload'); }
  /** `data` comes from swapRegion; the URL (`?region=…&state=…`) only picks the first region. */
  async create(data: Partial<RegionTarget> = {}) {
    const query = new URLSearchParams(location.search);
    const region = data.region ?? query.get('region') ?? START.region;
    const asked = data.state ?? query.get('state');
    const state: RegionState = asked === 'clean' || asked === 'anomaly' ? asked : region === START.region ? START.state : 'anomaly';
    const assets = new Assets(this);
    const manifest = await assets.stage(region, state);
    const collisions = manifest.chunks[0].id === 'fallback' ? [] : await loadCollisions(manifest, state);
    for (const board of BOARDS) await assets.board(board);
    await assets.placeholder('coffee-placeholder');
    this.scene.start('Stage', { manifest, state, collisions, spawn: data.spawn });
  }
}

export class Stage extends Phaser.Scene {
  private player?: Player;
  private defeatedBosses = new Set<string>();
  private follow?: ReturnType<typeof cameraFollow>;
  private combat?: ChairCombat;
  private coffee?: CoffeePoints;
  private rovers?: Rovers;
  private triggers?: Triggers;
  private jenny?: JennyBoss;
  get playerActor() { return this.player; }
  get chair() { return this.combat; }
  constructor() { super('Stage'); }
  create(data: { manifest: StageManifest; state: RegionState; collisions: CollisionChunk[]; spawn?: Position }) {
    drawStage(this, data.manifest, data.state);
    collisionDebug(this, data.collisions);
    const machine = import.meta.env.DEV && new URLSearchParams(location.search).has('coffee-test')
      ? data.collisions.flatMap(chunk => chunk.world.interact).find(box => box.kind === 'coffee-machine') : undefined;
    const rover = import.meta.env.DEV && new URLSearchParams(location.search).has('rover-test')
      ? data.collisions.flatMap(chunk => chunk.world.spawn).find(spawn => spawn.kind === 'rover') : undefined;
    const gate = import.meta.env.DEV && new URLSearchParams(location.search).has('boss-test')
      ? data.collisions.flatMap(chunk => chunk.world.interact).find(box => box.kind === 'boss-gate') : undefined;
    this.player = new Player(this, data.collisions, data.manifest.region, this.defeatedBosses,
      machine ? { x: machine.x + machine.w / 2, y: machine.y + machine.h }
        : rover ? { x: rover.x - BODY_WIDTH * 3, y: rover.y }
        : gate ? { x: gate.x - BODY_WIDTH * 2, y: gate.y + gate.h } : data.spawn);
    this.player.onHealthChanged = health => {
      const hud = this.scene.get('HUD') as Phaser.Scene & { model?: { setHealth(health: number, at: number): void } };
      hud.model?.setHealth(health, this.time.now);
    };
    this.combat = new ChairCombat(this, this.player, data.manifest.region);
    this.coffee = new CoffeePoints(this, this.player, data.collisions);
    this.rovers = new Rovers(this, this.player, this.combat, data.collisions);
    this.jenny = new JennyBoss(this, this.player, this.combat, data.collisions);
    this.triggers = new Triggers(data.collisions, data.manifest.region);
    this.follow = import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')
      ? undefined : cameraFollow(this, data.manifest);
    this.scene.launch('UI');
    // Inspection mode keeps manual panning for annotation review.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (pointer.isDown) {
          this.cameras.main.scrollX -= pointer.x - pointer.prevPosition.x;
          this.cameras.main.scrollY -= pointer.y - pointer.prevPosition.y;
        }
      });
    }
  }
  update(_time: number, delta: number) {
    const active = Math.min(100, this.combat?.pause.consume(delta) ?? delta);
    if (active <= 0) return;
    this.coffee?.update();
    this.player?.update(active);
    this.combat?.update(active);
    this.rovers?.update(active);
    this.jenny?.update(active);
    if (this.player && this.player.life.dead === 0) this.triggers?.emit(this.player.body);
    if (this.player) this.follow?.(this.player.body, active);
  }
}

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }
}
