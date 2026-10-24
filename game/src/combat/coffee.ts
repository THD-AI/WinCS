import type Phaser from 'phaser';
import type { Box, CollisionChunk } from '../stage/collision';
import { overlaps, type Body } from '../player/body';
import type { Player } from '../player/player';

/**
 * The approved machine's idle clip (coffee-machine.anims.json: steady, flicker, the pond on the screen). It glows
 * steadily; every 2 s the screen flickers for one frame, and every fourth flicker shows the pond instead – the
 * Hidden Garden's anomaly leaking through (docs/03). `fps` comes from the clip.
 */
export function coffeeFrame(milliseconds: number, fps: number): number {
  const frame = Math.floor(milliseconds / (1000 / fps));
  const period = 2 * fps;
  if (frame % period !== 0) return 0;
  return (frame / period) % 4 === 3 ? 2 : 1;
}

/** Up is edge-triggered, including when it was already held on entering range. */
export class CoffeeUse {
  private held = false;
  step(up: boolean, body: Body, eligible: boolean, machines: Box[]) {
    const pressed = up && !this.held; this.held = up;
    return pressed && eligible && body.grounded
      ? machines.find(box => box.kind === 'coffee-machine' && overlaps(body, box)) : undefined;
  }
}

export class CoffeePoints {
  private use = new CoffeeUse();
  private keys;
  /** The machines' sprites (the scene gives them the actors' rim). */
  readonly actors: Phaser.GameObjects.Sprite[];
  private machines: Box[];
  private fps: number;
  constructor(private scene: Phaser.Scene, private player: Player, chunks: CollisionChunk[]) {
    this.machines = chunks.flatMap(chunk => chunk.world.interact).filter(box => box.kind === 'coffee-machine');
    this.keys = scene.input.keyboard!.addKeys('W,UP,J') as Record<string, Phaser.Input.Keyboard.Key>;
    // The approved art is drawn at the box's measured size (42 × 80 for a 40 × 80 box), so it is never stretched.
    this.actors = this.machines.map(box => scene.add.sprite(box.x + box.w / 2, box.y + box.h,
      'coffee-machine', 'idle-00').setOrigin(0.5, 1).setDepth(99));
    this.fps = (scene.cache.json.get('coffee-machine.anims') as { idle?: { fps: number } } | undefined)?.idle?.fps ?? 12;
  }
  update() {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const up = this.keys.W.isDown || this.keys.UP.isDown || !!pad?.up || (pad?.leftStick.y ?? 0) < -0.2;
    const machine = this.use.step(up, this.player.body, this.player.canAttack && !this.keys.J.isDown && !pad?.X, this.machines);
    if (machine && this.player.beginInteraction()) this.player.saveCheckpoint(machine.id!);
    const frame = `idle-0${coffeeFrame(this.scene.time.now, this.fps)}`;
    for (const actor of this.actors) actor.setFrame(frame);
  }
}
