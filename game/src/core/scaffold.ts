import Phaser from 'phaser';

export const PLACEHOLDERS = ['hero', 'dexter', 'rover', 'crab', 'drone', 'jenny'] as const;

// Bootstrap-only scenes live in lane B until lane A provides story/UI scenes.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { this.scene.start('Preload'); }
}

export class Preload extends Phaser.Scene {
  constructor() { super('Preload'); }
  preload() {
    for (const board of PLACEHOLDERS) {
      const path = `/assets/placeholder/${board}`;
      this.load.atlas(board, `${path}.png`, `${path}.json`);
      this.load.json(`${board}.anims`, `${path}.anims.json`);
    }
  }
  create() { this.scene.start('Stage'); }
}

export class Stage extends Phaser.Scene {
  constructor() { super('Stage'); }
  create() { this.scene.launch('UI'); }
}

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }
}
