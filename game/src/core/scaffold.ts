import Phaser from 'phaser';
import type { StageData } from '../boot/contract';
import { drawStage } from '../stage/render';
import { collisionDebug } from '../stage/collision-debug';
import { Player } from '../player/player';
import { cameraFollow } from '../stage/camera';
import { ChairCombat } from '../combat/chair';
import { CoffeePoints } from '../combat/coffee';
import { ChairPickup } from '../combat/chairPickup';
import { Rovers } from '../enemies/rovers';
import { BODY_WIDTH } from '../player/body';
import { Triggers } from '../stage/triggers';

// Boot and Preload live in game/src/boot/ (the one loader); Stage receives boot/contract.ts StageData.
export class Stage extends Phaser.Scene {
  private player?: Player;
  private defeatedBosses = new Set<string>();
  private follow?: ReturnType<typeof cameraFollow>;
  private combat?: ChairCombat;
  private coffee?: CoffeePoints;
  private rovers?: Rovers;
  private triggers?: Triggers;
  get playerActor() { return this.player; }
  get chair() { return this.combat; }
  constructor() { super('Stage'); }
  create(data: StageData) {
    drawStage(this, data.manifest, data.state);
    collisionDebug(this, data.collisions);
    const machine = import.meta.env.DEV && new URLSearchParams(location.search).has('coffee-test')
      ? data.collisions.flatMap(chunk => chunk.world.interact).find(box => box.kind === 'coffee-machine') : undefined;
    const rover = import.meta.env.DEV && new URLSearchParams(location.search).has('rover-test')
      ? data.collisions.flatMap(chunk => chunk.world.spawn).find(spawn => spawn.kind === 'rover') : undefined;
    this.player = new Player(this, data.collisions, data.manifest.region, this.defeatedBosses,
      machine ? { x: machine.x + machine.w / 2, y: machine.y + machine.h }
        : rover ? { x: rover.x - BODY_WIDTH * 3, y: rover.y } : data.spawn);
    this.player.ground(data.manifest, data.state, data.surfaces);
    this.player.onHealthChanged = health => {
      const hud = this.scene.get('HUD') as Phaser.Scene & { model?: { setHealth(health: number, at: number): void } };
      hud.model?.setHealth(health, this.time.now);
    };
    this.combat = new ChairCombat(this, this.player, data.manifest.region);
    this.coffee = new CoffeePoints(this, this.player, data.collisions);
    new ChairPickup(this, this.player, this.combat, data.collisions);
    this.rovers = new Rovers(this, this.player, this.combat, data.collisions);
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
    if (this.player && this.player.life.dead === 0) this.triggers?.emit(this.player.body);
    if (this.player) this.follow?.(this.player.body, active);
  }
}

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }
}
