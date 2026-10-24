import Phaser from 'phaser';
import { Boot } from './boot/Boot';
import { Preload } from './boot/Preload';
import { Stage, UI } from './core/scaffold';
import { displayScale, VIEW_HEIGHT, VIEW_WIDTH } from './core/viewport';
import { LANE_A_SCENES } from './scenes/registry';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  backgroundColor: '#17242d',
  pixelArt: true,
  roundPixels: true,
  input: { gamepad: true },
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Preload, Stage, UI, ...LANE_A_SCENES],
});

function resize() {
  game.scale.setZoom(displayScale(window.innerWidth, window.innerHeight));
}
game.events.once(Phaser.Core.Events.READY, resize);
// Dev builds: the console can reach the game (`game.scene.getScene('Stage')`) for checks and debugging.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
window.addEventListener('resize', resize);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('resize', resize);
  game.destroy(true);
});
