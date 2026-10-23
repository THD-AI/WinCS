import Phaser from 'phaser';
import { Assets, BOARDS } from '../stage/assets';
import { drawStage } from '../stage/render';
import type { StageManifest, RegionState } from '../stage/manifest';
import { loadCollisions, type CollisionChunk } from '../stage/collision';
import { collisionDebug } from '../stage/collision-debug';
import { Player } from '../player/player';
import { cameraFollow } from '../stage/camera';
import { ChairCombat } from '../combat/chair';

// Bootstrap-only scenes live in lane B until lane A provides story/UI scenes.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { this.scene.start('Preload'); }
}

export class Preload extends Phaser.Scene {
  constructor() { super('Preload'); }
  async create() {
    const query = new URLSearchParams(location.search);
    const region = query.get('region') ?? 'rusty-creek';
    const state: RegionState = query.get('state') === 'clean' ? 'clean' : 'anomaly';
    const assets = new Assets(this);
    const manifest = await assets.stage(region, state);
    const collisions = manifest.chunks[0].id === 'fallback' ? [] : await loadCollisions(manifest, state);
    for (const board of BOARDS) await assets.board(board);
    this.scene.start('Stage', { manifest, state, collisions });
  }
}

export class Stage extends Phaser.Scene {
  private player?: Player;
  private defeatedBosses = new Set<string>();
  private follow?: ReturnType<typeof cameraFollow>;
  private combat?: ChairCombat;
  get playerActor() { return this.player; }
  get chair() { return this.combat; }
  constructor() { super('Stage'); }
  create(data: { manifest: StageManifest; state: RegionState; collisions: CollisionChunk[] }) {
    drawStage(this, data.manifest, data.state);
    collisionDebug(this, data.collisions);
    this.player = new Player(this, data.collisions, data.manifest.region, this.defeatedBosses);
    this.player.onHealthChanged = health => {
      const hud = this.scene.get('HUD') as Phaser.Scene & { model?: { setHealth(health: number, at: number): void } };
      hud.model?.setHealth(health, this.time.now);
    };
    this.combat = new ChairCombat(this, this.player, data.manifest.region);
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
    this.player?.update(active);
    this.combat?.update(active);
    if (this.player) this.follow?.(this.player.body, active);
  }
}

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }
}
