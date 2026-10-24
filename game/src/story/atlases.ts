import type Phaser from 'phaser';

/** An animation from an exported atlas (scripts/export_atlas.py names frames `<anim>-NN`). */
export type AtlasAnim = [atlas: string, anim: string, frames: number, repeat: number];

const requested = new Set<string>();

/**
 * Queue sprite atlases once per game. Story scenes all start active and preload at the same time, so two of
 * them asking for the same key would collide in the texture manager; the first asks, the others wait for it.
 */
export function loadAtlases(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const key of keys) {
    if (scene.textures.exists(key) || requested.has(key)) continue;
    requested.add(key);
    scene.load.atlas(key, `assets/sprites/${key}.png`, `assets/sprites/${key}.json`);
  }
}

/** Create the animations whose atlas has arrived (key `<atlas>:<anim>`); call it again later for the rest. */
export function createAnims(scene: Phaser.Scene, anims: readonly AtlasAnim[]): void {
  for (const [atlas, anim, frames, repeat] of anims) {
    const key = `${atlas}:${anim}`;
    if (scene.anims.exists(key) || !scene.textures.exists(atlas)) continue;
    const names = Array.from({ length: frames }, (_, i) => ({ key: atlas, frame: `${anim}-${String(i).padStart(2, '0')}` }));
    scene.anims.create({ key, frames: names, frameRate: 12, repeat });
  }
}
