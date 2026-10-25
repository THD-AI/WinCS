import type Phaser from 'phaser';
import type { Box, CollisionChunk } from '../stage/collision';
import { overlaps, type Body } from '../player/body';
import type { Player } from '../player/player';
import { bindings, CODES, physicalKeys } from '../player/physicalKeys';

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

/** How close (px, centre to centre) the hero must be for the coffee prompt to show. */
export const COFFEE_PROMPT_RANGE = 140;

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
  private physical: { any(codes: readonly string[]): boolean };
  /** The machines' sprites (the scene gives them the actors' rim). */
  readonly actors: Phaser.GameObjects.Sprite[];
  private machines: Box[];
  private fps: number;
  private glows: Phaser.GameObjects.Ellipse[];
  private prompt: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene, private player: Player, chunks: CollisionChunk[]) {
    this.machines = chunks.flatMap(chunk => chunk.world.interact).filter(box => box.kind === 'coffee-machine');
    this.keys = scene.input.keyboard!.addKeys('W,UP,J,X') as Record<string, Phaser.Input.Keyboard.Key>;
    this.physical = physicalKeys(scene);
    // Drawn 1.5x since 24 Oct (120 px next to the 114 px hero; Lex: "way too hidden"), from the approved board.
    this.actors = this.machines.map(box => scene.add.sprite(box.x + box.w / 2, box.y + box.h,
      'coffee-machine', 'idle-00').setOrigin(0.5, 1).setDepth(99));
    // A warm light that breathes, so the machine reads as a place of rest from across the screen.
    this.glows = this.machines.map(box => scene.add.ellipse(box.x + box.w / 2, box.y + box.h - 60, 190, 170, 0xffb347, 0.16)
      .setDepth(98).setBlendMode('ADD'));
    // Near it: what it is and which key uses it.
    this.prompt = scene.add.text(0, 0, '↑  coffee – rest and save', { fontFamily: 'monospace', fontSize: '13px',
      color: '#fff3d6', backgroundColor: '#2a1a0ecc', padding: { x: 6, y: 3 } }).setOrigin(0.5, 1).setDepth(10002).setVisible(false);
    this.fps = (scene.cache.json.get('coffee-machine.anims') as { idle?: { fps: number } } | undefined)?.idle?.fps ?? 12;
  }
  update() {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const up = bindings.isDefault('up') && (this.keys.W.isDown || this.keys.UP.isDown) || this.physical.any(CODES.up) || !!pad?.up || (pad?.leftStick.y ?? 0) < -0.2;
    const attacking = bindings.isDefault('attack') && (this.keys.J.isDown || this.keys.X.isDown) || this.physical.any(CODES.attack) || !!pad?.X;
    const machine = this.use.step(up, this.player.body, this.player.canAttack && !attacking, this.machines);
    if (machine && this.player.beginInteraction()) this.player.saveCheckpoint(machine.id!);
    const frame = `idle-0${coffeeFrame(this.scene.time.now, this.fps)}`;
    for (const actor of this.actors) actor.setFrame(frame);
    const breath = 0.13 + 0.06 * Math.sin(this.scene.time.now / 600);
    for (const glow of this.glows) glow.setFillStyle(0xffb347, breath);
    const body = this.player.body;
    const near = this.machines.find(box => Math.abs(body.x - (box.x + box.w / 2)) < COFFEE_PROMPT_RANGE && Math.abs(body.y - (box.y + box.h)) < 60);
    this.prompt.setVisible(!!near && this.player.canAttack);
    if (near) this.prompt.setPosition(Math.round(near.x + near.w / 2), Math.round(near.y + near.h - 128 + 3 * Math.sin(this.scene.time.now / 300)));
  }
}
