import type Phaser from 'phaser';

// Every atlas is loaded once, by Preload (stage/assets.ts BOARDS): story scenes start active at boot and only
// create their animations when they first need them, so two loaders never ask for the same texture key.

/** An animation from an exported atlas (scripts/export_atlas.py names frames `<anim>-NN`). */
export type AtlasAnim = [atlas: string, anim: string, frames: number, repeat: number];

/** Create the animations whose atlas has arrived (key `<atlas>:<anim>`); call it again later for the rest. */
export function createAnims(scene: Phaser.Scene, anims: readonly AtlasAnim[]): void {
  for (const [atlas, anim, frames, repeat] of anims) {
    const key = `${atlas}:${anim}`;
    if (scene.anims.exists(key) || !scene.textures.exists(atlas)) continue;
    const names = Array.from({ length: frames }, (_, i) => ({ key: atlas, frame: `${anim}-${String(i).padStart(2, '0')}` }));
    scene.anims.create({ key, frames: names, frameRate: 12, repeat });
  }
}
