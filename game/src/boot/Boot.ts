import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../core/viewport';
import type { PreloadData } from './contract';
import { AssetLoader } from './loader';
import { bootEntries, uiAtlasEntry } from './manifest';
import { pixelText, registerPixelFont } from './pixelFont';
import { LoadTracker } from './progress';
import { PALETTE } from './LoadingView';

/**
 * First scene: the pixel font (drawn in code) and the small UI atlas the loading screen is made of. Both are
 * optional – without the atlas the loading screen draws itself in code – so Boot always moves on to Preload.
 */
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  async create(data: PreloadData = {}): Promise<void> {
    registerPixelFont(this);
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, PALETTE.night).setOrigin(0);
    pixelText(this, VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 'C:\\> BOOT', 2, PALETTE.dim).setOrigin(0.5);
    hideOverlays(this);
    const loader = new AssetLoader(this, new LoadTracker());
    try {
      await loader.run(bootEntries());
      await loader.run([uiAtlasEntry()]);
    } catch (error) { console.error('[boot] UI atlas unavailable, drawing the loading screen in code', error); }
    this.scene.start('Preload', data);
  }
}

/** Scenes that start active at boot (HUD) stay hidden until the stage runs. */
export function hideOverlays(scene: Phaser.Scene): void {
  if (scene.scene.get('HUD')) scene.scene.setVisible(false, 'HUD');
}
