import type Phaser from 'phaser';
import { gameEvents, type GameEvents } from '../core/events';

/**
 * When the hero falls out of the level (`fell-out`: below every floor, not into water), keep the evidence: the
 * frame at that moment, where the hero was, where they last stood safely and the last two seconds of their path.
 * In `npm run dev` it goes to the repo's tmp/falls/ through the dev server (vite.config.ts); in a build it stays
 * in memory and the menu's Debug tab can save the last one. Always on, so a fall during a playtest is never lost.
 */
export interface FallRecord {
  at: string; region: string; position: { x: number; y: number }; lastSafe: { x: number; y: number };
  trail: { x: number; y: number }[]; image?: string;
}

const TRAIL = 120; // frames (~2 s)
export const falls: FallRecord[] = [];

export function fallCapture(scene: Phaser.Scene, hero: () => { x: number; y: number } | undefined) {
  const trail: { x: number; y: number }[] = [];
  const sample = () => {
    const body = hero();
    if (!body) return;
    trail.push({ x: Math.round(body.x), y: Math.round(body.y) });
    if (trail.length > TRAIL) trail.shift();
  };
  scene.events.on('postupdate', sample);
  const off = gameEvents.on('fell-out', (fall: GameEvents['fell-out']) => {
    const record: FallRecord = { at: new Date().toISOString(), region: fall.region,
      position: { x: Math.round(fall.position.x), y: Math.round(fall.position.y) }, lastSafe: fall.lastSafe, trail: [...trail] };
    falls.push(record);
    if (falls.length > 10) falls.shift();
    console.warn(`fell out of ${fall.region} at ${record.position.x},${record.position.y} (last safe ${fall.lastSafe.x},${fall.lastSafe.y})`);
    scene.game.renderer.snapshot(image => {
      record.image = (image as HTMLImageElement).src;
      if (import.meta.env.DEV) {
        fetch('/__debug/fall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) })
          .catch(() => undefined);
      }
    });
  });
  scene.events.once('shutdown', () => { off(); scene.events.off('postupdate', sample); });
}

/** Save a fall record as a file (production builds: the Debug tab's button). */
export function download(record: FallRecord) {
  const { image, ...data } = record;
  const link = document.createElement('a');
  const stamp = record.at.replace(/[:.]/g, '-');
  if (image) { link.href = image; link.download = `fall-${stamp}.png`; link.click(); }
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  link.download = `fall-${stamp}.json`; link.click();
}
