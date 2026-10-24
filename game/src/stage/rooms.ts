import type Phaser from 'phaser';
import type { Box, CollisionChunk } from './collision';
import { overlaps, type Body } from '../player/body';
import type { Player } from '../player/player';
import { CODES, physicalKeys } from '../player/physicalKeys';
import { gameEvents } from '../core/events';
import { PROP_DEPTH } from './depth';

/**
 * Doors and archive notes – what you find in a region's rooms (docs/09 "World pipeline", the Hidden Garden's
 * underground). Both are `interact` boxes in the collision files:
 * - `door`: `to` names the other door's id; ↑ in front of it fades out, and you stand at the other door's floor.
 *   Rooms are grid rows (camera.ts roomBounds), so a door is how you go from the garden into its cellar and back.
 * - `note`: `title` and `text`; a glint marks it, ↑ reads it, walking away (or ↑ again) puts it back.
 * Up is edge-triggered, as at the coffee machine, so holding it through a door does not walk you back.
 */
export const DOOR_FADE = 220;
/** How close (px, centre to body) the note prompt shows, and how far you can walk before a note closes. */
export const NOTE_RANGE = 90;

/** The door the body stands in when up is pressed (edge), and where it leads: the other door's floor, centred. */
export class DoorUse {
  private held = false;
  step(up: boolean, body: Body, eligible: boolean, doors: Box[]): { door: Box; to: { x: number; y: number } } | undefined {
    const pressed = up && !this.held; this.held = up;
    if (!pressed || !eligible || !body.grounded) return undefined;
    const door = doors.find(box => overlaps(body, box));
    const other = door && doors.find(box => box.id === door.to);
    return door && other ? { door, to: { x: other.x + other.w / 2, y: other.y + other.h } } : undefined;
  }
}

/** Every door names a door that exists and names it back. */
export function doorProblems(doors: Box[]): string[] {
  const byId = new Map(doors.map(d => [d.id, d]));
  return doors.flatMap(d => typeof d.to !== 'string' || !byId.has(d.to) ? [`door ${d.id}: no door ${String(d.to)}`]
    : byId.get(d.to)!.to !== d.id ? [`door ${d.id}: ${d.to} does not lead back`] : []);
}

/** The note the body is near (centre of the box within NOTE_RANGE, feet within the box's height). */
export function nearNote(body: Body, notes: Box[]): Box | undefined {
  return notes.find(n => Math.abs(body.x - (n.x + n.w / 2)) < NOTE_RANGE && body.y > n.y - 20 && body.y < n.y + n.h + 40);
}

export class Rooms {
  private doors: Box[];
  private notes: Box[];
  private use = new DoorUse();
  private upWas = false;
  private keys;
  private physical: { any(codes: readonly string[]): boolean };
  private prompt: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Text;
  private open?: Box;
  private read = new Set<string>();
  private glints = new Map<Box, Phaser.GameObjects.Graphics>();
  private travelling = false;

  constructor(private scene: Phaser.Scene, private player: Player, chunks: CollisionChunk[], private region: string) {
    const boxes = chunks.flatMap(chunk => chunk.world.interact);
    this.doors = boxes.filter(box => box.kind === 'door');
    this.notes = boxes.filter(box => box.kind === 'note');
    for (const problem of doorProblems(this.doors)) console.warn(`${region}: ${problem}`);
    this.keys = scene.input.keyboard!.addKeys('W,UP') as Record<string, Phaser.Input.Keyboard.Key>;
    this.physical = physicalKeys(scene);
    this.prompt = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#fff3d6',
      backgroundColor: '#2a1a0ecc', padding: { x: 6, y: 3 } }).setOrigin(0.5, 1).setDepth(10002).setVisible(false);
    // A sheet of paper held up to the screen, under the HUD: the camera's, not the world's; never over the hero's floor.
    this.panel = scene.add.text(scene.cameras.main.width / 2, 96, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#2b2118', backgroundColor: '#efe4c8f2', lineSpacing: 4,
      padding: { x: 18, y: 14 }, wordWrap: { width: 560 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10003).setVisible(false);
    for (const note of this.notes) this.glints.set(note, glint(scene, note));
  }

  update() {
    const pad = this.scene.input.gamepad?.getAll().find(p => p.connected);
    const up = this.keys.W.isDown || this.keys.UP.isDown || this.physical.any(CODES.up) || !!pad?.up || (pad?.leftStick.y ?? 0) < -0.2;
    const pressed = up && !this.upWas; this.upWas = up;
    const body = this.player.body;
    const free = this.player.canAttack && !this.travelling;
    const through = this.use.step(up, body, free, this.doors);
    if (through) this.travel(through.door, through.to);
    const note = free ? nearNote(body, this.notes) : undefined;
    if (this.open && (this.open !== note || pressed && !through)) this.close();
    else if (note && pressed && !through && !this.open) this.show(note);
    const door = free ? this.doors.find(box => overlaps(body, box)) : undefined;
    const at = door ?? (this.open ? undefined : note);
    this.prompt.setVisible(!!at);
    if (at) {
      // A door says nothing, only the key: the garden's prologue is wordless (docs/03). A note is read.
      this.prompt.setText(door ? '↑' : '↑  read');
      this.prompt.setPosition(Math.round(at.x + at.w / 2), Math.round(at.y - 10 + 3 * Math.sin(this.scene.time.now / 300)));
    }
  }

  private travel(door: Box, to: { x: number; y: number }) {
    if (!this.player.beginInteraction()) return;
    this.travelling = true;
    this.close();
    const camera = this.scene.cameras.main;
    camera.fadeOut(DOOR_FADE, 0, 0, 0);
    camera.once('camerafadeoutcomplete', () => {
      this.player.travel(to);
      gameEvents.emit('trigger-entered', { id: door.id!, kind: 'door', region: this.region, position: to });
      camera.fadeIn(DOOR_FADE * 1.4, 0, 0, 0);
      this.travelling = false;
    });
  }

  private show(note: Box) {
    this.open = note;
    this.panel.setText(`${String(note.title ?? '')}\n\n${String(note.text ?? '')}`).setVisible(true);
    if (!this.read.has(note.id!)) {
      this.read.add(note.id!);
      gameEvents.emit('trigger-entered', { id: note.id!, kind: 'note', region: this.region, position: { x: note.x, y: note.y } });
      const mark = this.glints.get(note);
      if (mark) { this.scene.tweens.killTweensOf(mark); mark.setAlpha(0.3).setScale(0.6); }  // read: it no longer calls
    }
  }

  private close() {
    this.open = undefined;
    this.panel.setVisible(false);
  }
}

/** The prologue's secret glint (Prologue.ts), over the note: something there catches the light. */
function glint(scene: Phaser.Scene, note: Box) {
  const g = scene.add.graphics({ x: note.x + note.w / 2, y: note.y + note.h - 14 }).setDepth(PROP_DEPTH);
  g.fillStyle(0xfff6d8, 1).fillTriangle(-2, 0, 2, 0, 0, -9).fillTriangle(-2, 0, 2, 0, 0, 9)
    .fillTriangle(0, -2, 0, 2, -9, 0).fillTriangle(0, -2, 0, 2, 9, 0).fillRect(-2, -2, 4, 4);
  scene.tweens.add({ targets: g, scale: { from: 0.4, to: 1.1 }, alpha: { from: 0.4, to: 1 }, duration: 520,
    yoyo: true, repeat: -1, repeatDelay: 1300, ease: 'Sine.easeInOut' });
  return g;
}
