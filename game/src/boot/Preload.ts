import Phaser from 'phaser';
import type { RegionState, StageManifest } from '../stage/manifest';
import { START } from '../stage/swap';
import { hideOverlays } from './Boot';
import type { PreloadData, StageData } from './contract';
import { AssetLoader } from './loader';
import { LoadingView, PALETTE } from './LoadingView';
import { registerPixelFont } from './pixelFont';
import { LoadTracker, type FileState } from './progress';

/** Production continues past failed required files on its own after this many seconds (a retry first). */
const AUTO_CONTINUE = 6;
const FADE = 260;

/** Resolve the region to load: swapRegion's data first, then `?region=…&state=…`, then the slice start. */
export function resolveTarget(data: PreloadData, search: string): { region: string; state: RegionState; first: boolean } {
  const query = new URLSearchParams(search);
  const first = !data.region;
  const region = data.region ?? query.get('region') ?? START.region;
  const asked = data.state ?? query.get('state');
  const state: RegionState = asked === 'clean' || asked === 'anomaly' ? asked : region === START.region ? START.state : 'anomaly';
  return { region, state, first };
}

/** The boot-log line for a file that finished or failed. */
export function logLine(file: FileState): string | undefined {
  const path = file.entry.url.split('/').pop() ?? file.entry.url;
  if (file.status === 'done') return `LOAD ${path} OK`;
  if (file.status === 'failed') return file.entry.optional ? `SKIP ${path} (NONE)` : `FAIL ${path} (${file.reason})`;
  return undefined;
}

/**
 * Loads everything a region needs through the one loader (boot/loader.ts), behind the loading screen, then
 * starts the menu (first load) or the stage (a region swap). Takes `{ region, state, spawn }` from swapRegion;
 * a swap reloads only what the new region adds. Failed required files show Retry / Continue; production
 * retries once and then continues on its own with placeholders, so the game never waits forever.
 */
export class Preload extends Phaser.Scene {
  tracker!: LoadTracker;
  private loader!: AssetLoader;
  private view!: LoadingView;
  private target!: ReturnType<typeof resolveTarget> & { spawn?: PreloadData['spawn'] };
  private manifest?: StageManifest;
  private waiting?: { retry: () => void; proceed: () => void };
  private retries = 0;
  private countdown?: Phaser.Time.TimerEvent;

  constructor() { super('Preload'); }

  create(data: PreloadData = {}): void {
    registerPixelFont(this);
    hideOverlays(this);
    this.target = { ...resolveTarget(data, location.search), spawn: data.spawn };
    this.retries = 0;
    this.waiting = undefined;
    this.tracker = new LoadTracker();
    this.loader = new AssetLoader(this, this.tracker);
    this.view = new LoadingView(this, this.target.region);
    this.tracker.onChange = file => {
      const line = logLine(file);
      if (line) this.view.line(line, file.status === 'failed' ? (file.entry.optional ? PALETTE.phosphorDim : PALETTE.red) : PALETTE.phosphor);
    };
    this.cameras.main.fadeIn(FADE, 12, 18, 24);

    const keys = this.input.keyboard;
    keys?.on('keydown-R', () => this.waiting?.retry());
    keys?.on('keydown-ENTER', () => this.waiting?.retry());
    keys?.on('keydown-C', () => this.waiting?.proceed());
    keys?.on('keydown-ESC', () => this.waiting?.proceed());
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (button.index === 0) this.waiting?.retry();
      else if (button.index === 1) this.waiting?.proceed();
    });
    this.input.on('pointerdown', () => this.waiting?.retry());
    void this.attempt();
  }

  update(time: number): void {
    this.view?.update(this.tracker.summary(), time);
  }

  private async attempt(): Promise<void> {
    const { region, state, first } = this.target;
    let crashed: Error | undefined;
    try { this.manifest = await this.loader.region(region, state, first) ?? this.manifest; }
    catch (error) { crashed = error as Error; console.error('[preload]', error); }
    if (!this.scene.isActive()) return; // the scene was stopped meanwhile (a newer swap)
    const data = this.manifest ? this.loader.stageData(this.manifest, state, this.target.spawn) : undefined;
    const errors = this.tracker.summary().errors;
    if (crashed && !errors.length) errors.push({ key: 'loader', url: 'loader', reason: crashed.message, optional: false });
    if (data && !errors.length) return this.finish(data);
    for (const error of errors) console.error(`[preload] ${error.url}: ${error.reason}`);
    // Production retries once quietly, then offers Retry / Continue and continues on its own.
    if (!import.meta.env.DEV && this.retries === 0) { this.retries++; return this.attempt(); }
    this.offer(errors);
  }

  private offer(errors: { url: string; reason: string }[]): void {
    let left = AUTO_CONTINUE;
    const auto = !import.meta.env.DEV;
    this.view.showErrors(errors, auto ? left : undefined);
    const stop = () => { this.waiting = undefined; this.countdown?.remove(); this.countdown = undefined; };
    this.waiting = {
      retry: () => { stop(); this.retries++; this.view.clearErrors(); this.view.line('RETRY...', PALETTE.cream); void this.attempt(); },
      proceed: () => { stop(); void this.proceed(); },
    };
    if (auto) this.countdown = this.time.addEvent({ delay: 1000, repeat: AUTO_CONTINUE - 1, callback: () => {
      left--;
      if (left > 0) this.view.showErrors(errors, left);
      else this.waiting?.proceed();
    } });
  }

  /** Continue without the failed files: placeholders for boards and plates, a one-plate stage if needed. */
  private async proceed(): Promise<void> {
    const { region, state, spawn } = this.target;
    this.view.line('CONTINUING WITHOUT THEM.', PALETTE.rust);
    this.manifest = await this.loader.degrade(region, state, this.manifest);
    if (this.scene.isActive()) this.finish(this.loader.stageData(this.manifest, state, spawn));
  }

  private finish(data: StageData): void {
    this.view.finish();
    this.time.delayedCall(this.target.first ? 420 : 120, () => {
      this.cameras.main.fadeOut(FADE, 12, 18, 24);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        const skipMenu = import.meta.env.DEV && new URLSearchParams(location.search).has('skip-menu');
        if (this.target.first && !skipMenu) return this.scene.start('Title', data);
        this.scene.setVisible(true, 'HUD');
        this.scene.start('Stage', data);
      });
    });
  }
}
