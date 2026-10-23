import Phaser from 'phaser';
import { Boot, Preload, Stage, UI } from './core/scaffold';
import { displayScale, VIEW_HEIGHT, VIEW_WIDTH } from './core/viewport';
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
  scene: [Boot, Preload, Stage, UI],
});

function resize() {
  game.scale.setZoom(displayScale(window.innerWidth, window.innerHeight));
}
game.events.once(Phaser.Core.Events.READY, resize);
window.addEventListener('resize', resize);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('resize', resize);
  game.destroy(true);
});
