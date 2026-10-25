import Phaser from 'phaser';
import type { StageData } from '../boot/contract';
import { drawStage } from '../stage/render';
import { collisionDebug } from '../stage/collision-debug';
import { Player } from '../player/player';
import { cameraFollow } from '../stage/camera';
import { ChairCombat } from '../combat/chair';
import { CoffeePoints } from '../combat/coffee';
import { ACTOR_RIM, addRim } from '../stage/atmosphere/pipeline';
import { ChairPickup } from '../combat/chairPickup';
import { Rovers } from '../enemies/rovers';
import { JennyBoss } from '../enemies/jennyBoss';
import { BODY_WIDTH } from '../player/body';
import { Triggers } from '../stage/triggers';
import { Rooms } from '../stage/rooms';
import { Props } from '../stage/props';
import { Ambient } from '../stage/ambient';
import { addChickens } from '../stage/chicken';
import { DebugOverlay, type EnemyLike, type JennyLike, type DexterLike } from '../stage/debugOverlay';
import { fallCapture } from '../stage/fallCapture';
import { GameMenu } from '../ui/menu';
import { spots } from '../stage/teleports';
import { holdStage, swapRegion } from '../stage/swap';

// Boot and Preload live in game/src/boot/ (the one loader); Stage receives boot/contract.ts StageData.
export class Stage extends Phaser.Scene {
  private player?: Player;
  private defeatedBosses = new Set<string>();
  private follow?: ReturnType<typeof cameraFollow>;
  private combat?: ChairCombat;
  private coffee?: CoffeePoints;
  private rovers?: Rovers;
  private triggers?: Triggers;
  private rooms?: Rooms;
  private props?: Props;
  private jenny?: JennyBoss;
  private overlay?: DebugOverlay;
  private menu?: GameMenu;
  get playerActor() { return this.player; }
  get chair() { return this.combat; }
  constructor() { super('Stage'); }
  create(data: StageData) {
    const stage = drawStage(this, data.manifest, data.state, data.atmosphere);
    const legend = collisionDebug(this, data.collisions);
    const machine = import.meta.env.DEV && new URLSearchParams(location.search).has('coffee-test')
      ? data.collisions.flatMap(chunk => chunk.world.interact).find(box => box.kind === 'coffee-machine') : undefined;
    const rover = import.meta.env.DEV && new URLSearchParams(location.search).has('rover-test')
      ? data.collisions.flatMap(chunk => chunk.world.spawn).find(spawn => spawn.kind === 'rover') : undefined;
    const gate = import.meta.env.DEV && new URLSearchParams(location.search).has('boss-test')
      ? data.collisions.flatMap(chunk => chunk.world.interact).find(box => box.kind === 'boss-gate') : undefined;
    this.player = new Player(this, data.collisions, data.manifest.region, this.defeatedBosses,
      machine ? { x: machine.x + machine.w / 2, y: machine.y + machine.h }
        : rover ? { x: rover.x - BODY_WIDTH * 3, y: rover.y }
        : gate ? onFloor(data.collisions, gate.x - BODY_WIDTH * 2, gate.y + gate.h) : data.spawn);
    this.player.ground(data.manifest, data.state, data.surfaces);
    stage.reflect(this.player.sprite);
    this.player.onHealthChanged = health => {
      const hud = this.scene.get('HUD') as Phaser.Scene & { model?: { setHealth(health: number, at: number): void } };
      hud.model?.setHealth(health, this.time.now);
    };
    this.combat = new ChairCombat(this, this.player, data.manifest.region);
    this.coffee = new CoffeePoints(this, this.player, data.collisions);
    for (const machine of this.coffee.actors) addRim(machine, ACTOR_RIM.colour, ACTOR_RIM.strength);
    new ChairPickup(this, this.player, this.combat, data.collisions);
    this.rovers = new Rovers(this, this.player, this.combat, data.collisions);
    this.jenny = new JennyBoss(this, this.player, this.combat, data.collisions);
    this.triggers = new Triggers(data.collisions, data.manifest.region);
    this.rooms = new Rooms(this, this.player, data.collisions, data.manifest.region);
    this.props = new Props(this, data.collisions, () => this.player?.body, data.state);
    new Ambient(this, data.collisions);
    addChickens(this, data.collisions);
    this.follow = import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')
      ? undefined : cameraFollow(this, data.manifest);
    this.overlay = new DebugOverlay(this, stage, legend, data.collisions, {
      hero: () => this.player?.body,
      // The overlay only reads plain fields of the models (debugOverlay.ts), whatever drives them.
      enemies: () => ((this.rovers as unknown as { rows?: { id: string; kind: string; model: EnemyLike }[] })?.rows ?? []),
      jenny: () => (this.jenny as unknown as { fight?: JennyLike })?.fight,
      dexter: () => (this.scene.get('Flow') as unknown as { prologue?: { guide?: DexterLike } })?.prologue?.guide,
    });
    fallCapture(this, () => this.player?.body);
    this.menu = new GameMenu(document.body, {
      pause: paused => holdStage(this.game.scene, paused),
      layers: () => this.overlay?.layers() ?? [],
      travel: {
        spots: () => spots(data.collisions),
        hero: () => this.player?.body,
        go: spot => this.player?.travel(spot),
        level: () => ({ region: data.manifest.region, state: data.state }),
        goLevel: target => swapRegion(this, target),
      },
      sound: {
        get muted() { return game.sound.mute; }, get volume() { return game.sound.volume; },
        setMute: muted => { game.sound.mute = muted; }, setVolume: volume => { game.sound.volume = volume; },
      },
    });
    const game = this.game;
    const menuKey = () => this.menu?.toggle();
    this.input.keyboard?.on('keydown-ESC', menuKey);
    // Esc keeps working while the stage is paused under the menu: the window hears it, not the paused scene.
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && this.menu?.isOpen) this.menu.toggle(false); };
    window.addEventListener('keydown', escape);
    const startPad = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => { if (button.index === 9) this.menu?.toggle(); };
    this.input.gamepad?.on('down', startPad);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-ESC', menuKey); window.removeEventListener('keydown', escape);
      this.input.gamepad?.off('down', startPad); this.menu?.destroy(); this.menu = undefined;
    });
    this.scene.launch('UI');
    // Inspection mode keeps manual panning for annotation review.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (pointer.isDown) {
          this.cameras.main.scrollX -= pointer.x - pointer.prevPosition.x;
          this.cameras.main.scrollY -= pointer.y - pointer.prevPosition.y;
        }
      });
    }
  }
  update(_time: number, delta: number) {
    const active = Math.min(100, this.combat?.pause.consume(delta) ?? delta);
    if (active <= 0) return;
    this.coffee?.update();
    this.rooms?.update();
    this.props?.update(active);
    this.player?.update(active);
    this.combat?.update(active);
    this.rovers?.update(active);
    this.jenny?.update(active);
    if (this.player && this.player.life.dead === 0) this.triggers?.emit(this.player.body);
    if (this.player) this.follow?.(this.player.body, active);
    this.overlay?.update();
  }
}

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }
}

/** A dev test spawn on the walk line under `x` nearest to `y` (the floor before a box can differ from its bottom). */
function onFloor(chunks: StageData['collisions'], x: number, y: number) {
  let best = y, gap = Infinity;
  for (const line of chunks.flatMap(chunk => chunk.world.walk)) {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if (x < a[0] || x > b[0]) continue;
      const at = a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1, b[0] - a[0]);
      if (Math.abs(at - y) < gap) { gap = Math.abs(at - y); best = at; }
    }
  }
  return { x, y: best };
}
