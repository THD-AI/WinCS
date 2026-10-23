import Phaser from 'phaser';
import { Assets, BOARDS } from '../stage/assets';
import { drawStage } from '../stage/render';
import type { StageManifest, RegionState } from '../stage/manifest';

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
    for (const board of BOARDS) await assets.board(board);
    this.scene.start('Stage', { manifest, state });
  }
}

export class Stage extends Phaser.Scene {
  constructor() { super('Stage'); }
  create(data: { manifest: StageManifest; state: RegionState }) {
    drawStage(this, data.manifest, data.state);
    this.scene.launch('UI');
    // Development inspection only; camera follow is implemented separately in #32.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (pointer.isDown) {
          this.cameras.main.scrollX -= pointer.x - pointer.prevPosition.x;
          this.cameras.main.scrollY -= pointer.y - pointer.prevPosition.y;
        }
      });
    }
  }
}

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }
}
