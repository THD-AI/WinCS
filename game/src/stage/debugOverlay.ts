import Phaser from 'phaser';
import { backdropColour, debugStore, describe, type DebugState } from '../core/debug';
import { BODY_HEIGHT, BODY_WIDTH } from '../player/body';
import { SPOT_RANGE } from '../enemies/rover';
import { CRAB_SPOT } from '../enemies/crab';
import { DRONE_SPOT } from '../enemies/drone';
import type { StageHandles } from './render';
import type { CollisionChunk } from './collision';

/**
 * Debug mode drawn into the stage (docs/02 "Menu and debug mode"): reads the live models every frame and never
 * changes them. What it shows is set in the menu's Debug tab (core/debug.ts):
 * - layers: any layer id switched off in every chunk, over a purple backdrop that shows each hole in a plate;
 * - collision: the authoring legend (stage/collision-debug.ts) over the same geometry physics uses;
 * - actors: hitboxes, facing arrows, sight boxes, patrol paths with their turn points, phase and health of every
 *   enemy, Jenny's arena and state, Dexter's route and next stop, the hero's body, speed and ground;
 * - stats: FPS, the hero's position and chunk, and one line naming every switch that is on (for screenshots).
 */

/** The models the overlay reads – plain fields, so it works with whatever moves them. */
export interface DebugSources {
  hero: () => { x: number; y: number; vx: number; vy: number; grounded: boolean } | undefined;
  enemies: () => readonly { id: string; kind: string; model: EnemyLike }[];
  jenny: () => JennyLike | undefined;
  dexter: () => DexterLike | undefined;
}
export interface EnemyLike {
  x: number; y: number; phase: string; direction: number; health: number; patrol: readonly [number, number];
  bounds: { x: number; y: number; w: number; h: number };
}
export interface JennyLike {
  x: number; phase: string; facing: number; health: number; active: boolean;
  arena: { left: number; right: number; floor: number }; bounds: { x: number; y: number; w: number; h: number };
}
export interface DexterLike { x: number; state: string; stop?: { x: number }; route?: unknown }

/** How far each kind sees ahead (px), from its model's constants; the sight box is one body high. */
export const SIGHT: Record<string, number> = { rover: SPOT_RANGE, crab: CRAB_SPOT, drone: DRONE_SPOT };
const ALERT = new Set(['tell', 'charge', 'stab', 'dive']);

/** The sight box in front of an enemy: from its centre `range` px the way it faces, one body high. */
export function sightBox(e: Pick<EnemyLike, 'x' | 'y' | 'direction'>, range: number) {
  return { x: e.direction > 0 ? e.x : e.x - range, y: e.y - BODY_HEIGHT, w: range, h: BODY_HEIGHT };
}

export class DebugOverlay {
  private world: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private stats: Phaser.GameObjects.Text;
  private background: number;
  private off: () => void;

  constructor(private scene: Phaser.Scene, private stage: StageHandles, private collision: Phaser.GameObjects.Graphics,
    private chunks: CollisionChunk[], private sources: DebugSources) {
    this.world = scene.add.graphics().setDepth(10005);
    this.stats = scene.add.text(8, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff',
      backgroundColor: '#000000aa', padding: { x: 4, y: 3 } }).setScrollFactor(0).setDepth(10010).setVisible(false);
    this.background = scene.cameras.main.backgroundColor.color;
    this.off = debugStore.on(state => this.apply(state));
    scene.events.once('shutdown', () => this.destroy());
    this.apply(debugStore.state);
  }

  /** Layer ids in the stage, back to front, with their z – what the Debug tab lists. */
  layers(): { id: string; z: number }[] {
    const seen = new Map<string, number>();
    for (const drawn of this.stage.layers) if (!seen.has(drawn.layer.id)) seen.set(drawn.layer.id, drawn.layer.z);
    return [...seen].map(([id, z]) => ({ id, z })).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  }

  private apply(state: DebugState) {
    // Layer visibility: the stage's culling (render.ts) asks debugStore each frame.
    const camera = this.scene.cameras.main;
    camera.setBackgroundColor(debugStore.shows('backdrop') ? backdropColour(state) : this.background);
    camera.setZoom(state.zoom); // a Settings choice: wider views work with debug mode off too
    this.collision.setVisible(debugStore.shows('collision'));
    this.stats.setVisible(debugStore.shows('stats'));
    if (!debugStore.shows('actors')) { this.world.clear(); for (const label of this.labels) label.setVisible(false); }
  }

  update() {
    if (debugStore.shows('stats')) this.drawStats();
    if (!debugStore.shows('actors')) return;
    const g = this.world.clear();
    let n = 0;
    const label = (x: number, y: number, text: string, colour = '#ffffff') => {
      const t = this.labels[n] ?? (this.labels[n] = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px',
        backgroundColor: '#000000aa', padding: { x: 2, y: 1 } }).setDepth(10006).setOrigin(0.5, 1));
      n++;
      t.setPosition(Math.round(x), Math.round(y)).setText(text).setColor(colour).setVisible(true);
    };
    const hero = this.sources.hero();
    if (hero) {
      g.lineStyle(2, 0xffffff).strokeRect(hero.x - BODY_WIDTH / 2, hero.y - BODY_HEIGHT, BODY_WIDTH, BODY_HEIGHT);
      arrow(g, hero.x, hero.y - BODY_HEIGHT / 2, hero.vx >= 0 ? 1 : -1, 0xffffff);
      label(hero.x, hero.y - BODY_HEIGHT - 4,
        `hero ${Math.round(hero.x)},${Math.round(hero.y)} v ${Math.round(hero.vx)},${Math.round(hero.vy)} ${hero.grounded ? 'ground' : 'air'}`);
    }
    for (const { id, kind, model: e } of this.sources.enemies()) {
      if (e.health <= 0 && e.phase === 'dead') continue;
      const alert = ALERT.has(e.phase);
      const colour = alert ? 0xff3030 : 0xffb030;
      g.lineStyle(1, 0x30c0ff, 0.9).beginPath().moveTo(e.patrol[0], e.y + 3).lineTo(e.patrol[1], e.y + 3).strokePath();
      for (const turn of e.patrol) g.fillStyle(0x30c0ff).fillRect(turn - 3, e.y, 6, 6);
      const range = SIGHT[kind];
      if (range) {
        const sight = sightBox(e, range);
        const sees = hero && hero.x >= sight.x && hero.x <= sight.x + sight.w && Math.abs(hero.y - e.y) <= BODY_HEIGHT;
        g.fillStyle(sees ? 0xff3030 : 0xffe060, sees ? 0.28 : 0.14).fillRect(sight.x, sight.y, sight.w, sight.h);
      }
      g.lineStyle(2, colour).strokeRect(e.bounds.x, e.bounds.y, e.bounds.w, e.bounds.h);
      arrow(g, e.x, e.bounds.y + e.bounds.h / 2, e.direction, colour);
      label(e.x, e.bounds.y - 2, `${kind} ${id} ${e.phase} hp ${e.health}`, alert ? '#ff6060' : '#ffd080');
    }
    const jenny = this.sources.jenny();
    if (jenny) {
      const a = jenny.arena;
      g.lineStyle(1, 0xff60ff).strokeRect(a.left, a.floor - 260, a.right - a.left, 260);
      if (jenny.active) {
        const b = jenny.bounds;
        g.lineStyle(2, 0xff60ff).strokeRect(b.x, b.y, b.w, b.h);
        arrow(g, jenny.x, b.y + b.h / 2, jenny.facing, 0xff60ff);
      }
      label((a.left + a.right) / 2, a.floor - 262, `jenny ${jenny.phase} hp ${jenny.health}`, '#ff90ff');
    }
    const dexter = this.sources.dexter();
    if (dexter && hero) {
      const y = groundAt(this.chunks, dexter.x, hero.y);
      g.lineStyle(2, 0x60ff90).strokeRect(dexter.x - 12, y - 30, 24, 30);
      if (dexter.stop) {
        g.lineStyle(1, 0x60ff90, 0.8).beginPath().moveTo(dexter.x, y - 15).lineTo(dexter.stop.x, y - 15).strokePath();
        g.fillStyle(0x60ff90).fillCircle(dexter.stop.x, y - 15, 4);
      }
      label(dexter.x, y - 32, `dexter ${dexter.state}${dexter.stop ? ` → ${Math.round(dexter.stop.x)}` : ''}`, '#90ffb0');
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  private drawStats() {
    const hero = this.sources.hero();
    const chunk = hero ? this.chunks.find(c => hero.x >= c.origin[0] && hero.x < c.origin[0] + c.local.size[0]
      && hero.y >= c.origin[1] && hero.y < c.origin[1] + c.local.size[1] + 200) : undefined;
    this.stats.setText([`${Math.round(this.scene.game.loop.actualFps)} fps`,
      hero ? `hero ${Math.round(hero.x)}, ${Math.round(hero.y)}${chunk ? `  ${chunk.local.chunk}` : ''}` : '',
      describe(debugStore.state)].filter(Boolean).join('\n'));
  }

  destroy() { this.off(); this.world.destroy(); this.stats.destroy(); for (const label of this.labels) label.destroy(); }
}

function arrow(g: Phaser.GameObjects.Graphics, x: number, y: number, direction: number, colour: number) {
  const d = direction >= 0 ? 1 : -1;
  g.lineStyle(2, colour).beginPath().moveTo(x, y).lineTo(x + d * 22, y).strokePath();
  g.fillStyle(colour).fillTriangle(x + d * 28, y, x + d * 20, y - 5, x + d * 20, y + 5);
}

/** The walk line under x nearest to `near` (for actors the overlay only knows by x). */
function groundAt(chunks: CollisionChunk[], x: number, near: number): number {
  let best = near, gap = Infinity;
  for (const line of chunks.flatMap(chunk => chunk.world.walk)) {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if (x < a[0] || x > b[0]) continue;
      const at = a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1, b[0] - a[0]);
      if (Math.abs(at - near) < gap) { gap = Math.abs(at - near); best = at; }
    }
  }
  return best;
}
