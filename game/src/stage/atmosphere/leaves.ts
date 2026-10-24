import Phaser from 'phaser';
import type { LeafLayer, Leaves, Wind } from './config';
import { gustAt } from './wind';

/**
 * Falling leaves in front of and behind the actors. They are screen-space emitters nudged against the
 * camera at their own parallax, pushed by the same wind and gusts the foliage shows, and flutter
 * (they flip and rock while they fall). Art: workstream 5's `fx-leaves` sheet when it is loaded,
 * otherwise small pixel leaves drawn here in the stage's own autumn colours.
 */
export const LEAF_SHEET = 'fx-leaves';
const PROCEDURAL = 'fx-leaves-procedural';
/** Leaf silhouettes, 6×4 px: 1 = body, 2 = vein/stem (drawn darker). */
const SHAPES = [
  ['..11..', '.1121.', '112211', '..2...'],
  ['.11...', '11211.', '.11211', '....2.'],
  ['..1...', '.121..', '11211.', '.2....'],
];

function proceduralSheet(scene: Phaser.Scene, palette: number[]): string[] {
  const colours = palette.length ? palette : [0xd9a03a, 0xc9622b, 0xe8c454, 0x9a4a24];
  const key = `${PROCEDURAL}-${colours.join('-')}`;
  const frames: string[] = [];
  const width = 6, height = 4;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    colours.forEach((colour, c) => SHAPES.forEach((shape, s) => {
      const ox = (c * SHAPES.length + s) * (width + 1);
      const dark = Phaser.Display.Color.IntegerToColor(colour).darken(25).color;
      shape.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell === '.') return;
        g.fillStyle(cell === '2' ? dark : colour).fillRect(ox + x, y, 1, 1);
      }));
    }));
    g.generateTexture(key, colours.length * SHAPES.length * (width + 1), height).destroy();
    const texture = scene.textures.get(key);
    for (let i = 0; i < colours.length * SHAPES.length; i++) texture.add(`leaf-${i}`, 0, i * (width + 1), 0, width, height);
  }
  for (let i = 0; i < colours.length * SHAPES.length; i++) frames.push(`leaf-${i}`);
  return [key, ...frames];
}

export interface LeafEmitters {
  front: Phaser.GameObjects.Particles.ParticleEmitter | null;
  behind: Phaser.GameObjects.Particles.ParticleEmitter | null;
  /** Push with the wind and follow the camera; call once per frame. */
  update(t: number): void;
  destroy(): void;
}

export function addLeaves(scene: Phaser.Scene, leaves: Leaves, wind: Wind, palette: number[], depths: { front: number; behind: number }): LeafEmitters {
  let texture: string, frames: string[];
  if (scene.textures.exists(LEAF_SHEET)) {
    texture = LEAF_SHEET;
    frames = scene.textures.get(LEAF_SHEET).getFrameNames();
  } else {
    [texture, ...frames] = proceduralSheet(scene, leaves.palette.length ? leaves.palette : palette);
  }
  const { width, height } = scene.scale;
  const rising = leaves.fall === 'up';
  const upwind = wind.direction < 0 ? width + 260 : -260;

  const make = (layer: LeafLayer | null, depth: number) => {
    if (!layer) return null;
    const emitter = scene.add.particles(0, 0, texture, {
      frame: frames,
      x: { min: Math.min(-40, upwind), max: Math.max(width + 40, upwind) },
      y: rising ? height + 12 : -12,
      lifespan: { min: 9000, max: 16000 },
      speedX: { min: -12, max: 12 },
      speedY: rising ? { min: -42, max: -22 } : { min: 22, max: 46 },
      maxVelocityX: 150,
      maxVelocityY: 70,
      scaleY: { min: layer.scale[0], max: layer.scale[1] },
      // Flutter: the leaf flips (scaleX through 0) and rocks side to side, each on its own phase.
      scaleX: { onEmit: () => layer.scale[0] + Math.random() * (layer.scale[1] - layer.scale[0]),
        onUpdate: (p: Phaser.GameObjects.Particles.Particle) => p.scaleY * Math.cos(p.lifeCurrent * 0.004 + p.life) },
      accelerationX: { onEmit: () => 0, onUpdate: (p: Phaser.GameObjects.Particles.Particle) => 38 * Math.sin(p.lifeCurrent * 0.0025 + p.life) },
      rotate: { onEmit: () => Math.random() * 360, onUpdate: (p: Phaser.GameObjects.Particles.Particle, _k: string, _t: number, v: number) => v + 0.6 * Math.sin(p.lifeCurrent * 0.003 + p.life) },
      alpha: layer.alpha,
      tint: layer.tint,
      frequency: layer.every,
      advance: 12_000, // the view starts full of leaves
    }).setScrollFactor(0).setDepth(depth);
    return { emitter, scroll: layer.scroll };
  };
  const front = make(leaves.front, depths.front);
  const behind = make(leaves.behind, depths.behind);
  const camera = scene.cameras.main;
  let lastX = camera.scrollX, lastY = camera.scrollY, dx = 0, dy = 0;
  const shift = (p: Phaser.GameObjects.Particles.Particle) => { p.x -= dx; p.y -= dy; };
  const step = (entry: typeof front, t: number) => {
    if (!entry) return;
    const { emitter, scroll } = entry;
    // The gust passing the middle of the view pushes the leaves downwind.
    emitter.gravityX = wind.direction * (18 + 120 * wind.gust * gustAt(wind, camera.scrollX * scroll + width / 2, t));
    dx = (camera.scrollX - lastX) * scroll; dy = (camera.scrollY - lastY) * scroll;
    if (dx || dy) emitter.forEachAlive(shift, undefined);
  };
  return {
    front: front?.emitter ?? null,
    behind: behind?.emitter ?? null,
    update(t: number) {
      step(front, t); step(behind, t);
      lastX = camera.scrollX; lastY = camera.scrollY;
    },
    destroy() { front?.emitter.destroy(); behind?.emitter.destroy(); },
  };
}
