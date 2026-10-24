import type Phaser from 'phaser';
import type { CollisionChunk } from '../stage/collision';
import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import type { Player } from '../player/player';
import type { ChairCombat } from '../combat/chair';
import { intersects } from '../combat/sweeps';
import { gameEvents } from '../core/events';
import { Rover, ROVER_HEIGHT } from './rover';

export class Rovers {
  private rows;
  private debug: Phaser.GameObjects.Graphics;
  private visible = false;
  constructor(private scene: Phaser.Scene, private player: Player, chair: ChairCombat, chunks: CollisionChunk[]) {
    const cleanup: (() => void)[] = [];
    this.debug = scene.add.graphics().setDepth(10003);
    this.rows = chunks.flatMap(chunk => chunk.world.spawn).filter(spawn => spawn.kind === 'rover').map(spawn => {
      const range = spawn.patrol;
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] >= range[1]) {
        throw new Error(`Invalid rover patrol: ${spawn.id}`);
      }
      const model = new Rover({ x: spawn.x, y: spawn.y }, range as [number, number]);
      const sprite = scene.add.sprite(model.x, model.y, 'enemy-rover', 'idle-00').setOrigin(0.5, 1).setDepth(101);
      const label = scene.add.text(model.x, model.y - ROVER_HEIGHT - BODY_WIDTH / 2, '',
        { fontFamily: 'monospace', fontSize: '14px', backgroundColor: '#17242d' }).setDepth(102).setVisible(false);
      cleanup.push(chair.register({ id: spawn.id!, active: () => model.health > 0,
        bounds: () => model.bounds, hit: hit => model.hit(hit.damage, hit.direction) }));
      cleanup.push(player.life.register(spawn.id!, () => model.reset()));
      return { id: spawn.id!, model, sprite, label };
    });
    const toggle = () => { this.visible = !this.visible; for (const row of this.rows) row.label.setVisible(this.visible); };
    scene.input.keyboard?.on('keydown-F2', toggle);
    scene.events.once('shutdown', () => { scene.input.keyboard?.off('keydown-F2', toggle); cleanup.forEach(off => off()); });
  }
  update(milliseconds: number) {
    this.debug.clear();
    for (const { id, model, sprite, label } of this.rows) {
      const defeated = model.step(milliseconds / 1000, this.player.life.dead === 0 ? this.player.body : undefined);
      if (defeated) gameEvents.emit('enemy-defeated', { id, kind: 'rover', position: { x: model.x, y: model.y } });
      sprite.setPosition(Math.round(model.x), model.y).setFrame(model.pose)
        .setFlipX(model.direction > 0); // Approved charge has lidar left / trailing dust right.
      if (model.phase === 'hit') sprite.setTintFill(0xffffff); else sprite.clearTint();
      const box = model.bounds, body = this.player.body;
      if (model.health > 0 && intersects(box, { x: body.x - BODY_WIDTH / 2, y: body.y - BODY_HEIGHT, w: BODY_WIDTH, h: BODY_HEIGHT })) {
        this.player.damage(1, model.x, () => model.deflect(model.x >= body.x ? 1 : -1));
      }
      label.setPosition(model.x, model.y - ROVER_HEIGHT - BODY_WIDTH / 2).setText(`${id} ${model.health}/3 ${model.phase}`);
      if (this.visible && model.health > 0) this.debug.lineStyle(1, 0xff7835).strokeRect(box.x, box.y, box.w, box.h);
    }
  }
}
