import type Phaser from 'phaser';
import type { Box, CollisionChunk } from '../stage/collision';
import { overlaps, type Body } from '../player/body';
import type { Player } from '../player/player';

// docs/02 placeholder timing: one authored 12 fps frame dimmed every two seconds.
export const coffeeAlpha = (milliseconds: number) => Math.floor(milliseconds / (1000 / 12)) % 24 === 0 ? 0.65 : 1;

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
  private actors: Phaser.GameObjects.Sprite[];
  private machines: Box[];
  constructor(private scene: Phaser.Scene, private player: Player, chunks: CollisionChunk[]) {
    this.machines = chunks.flatMap(chunk => chunk.world.interact).filter(box => box.kind === 'coffee-machine');
    this.keys = scene.input.keyboard!.addKeys('W,UP') as Record<string, Phaser.Input.Keyboard.Key>;
    this.actors = this.machines.map(box => scene.add.sprite(box.x + box.w / 2, box.y + box.h,
      'coffee-placeholder', 'idle-00').setOrigin(0.5, 1).setDisplaySize(box.w, box.h).setDepth(99));
  }
  update() {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const up = this.keys.W.isDown || this.keys.UP.isDown || !!pad?.up || (pad?.leftStick.y ?? 0) < -0.2;
    const machine = this.use.step(up, this.player.body, this.player.canAttack, this.machines);
    if (machine && this.player.beginInteraction()) this.player.saveCheckpoint(machine.id!);
    for (const actor of this.actors) actor.setAlpha(coffeeAlpha(this.scene.time.now));
  }
}
