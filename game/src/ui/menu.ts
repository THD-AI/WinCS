import { debugStore, ZOOMS } from '../core/debug';
import { LEVELS, nextSpot, type Spot } from '../stage/teleports';
import type { RegionTarget } from '../stage/swap';
import { download, falls } from '../stage/fallCapture';

/**
 * The game menu (docs/02 "Menu and debug mode"): a small ☰ button in the corner, Esc or the pad's Start. It pauses
 * the stage and has four tabs – Controls (keyboard and gamepad), Settings (sound, zoom, full screen), Debug (the
 * switches in core/debug.ts and every stage layer) and Coming soon. Plain DOM over the canvas: crisp at any scale,
 * mouse, touch and keyboard all work. The stage tells it what it has (`MenuHost`); the menu never reaches into
 * the scenes itself.
 */
export interface MenuHost {
  /** Pause or resume the stage (and its sounds). */
  pause(paused: boolean): void;
  /** The stage's layer ids, back to front. */
  layers(): { id: string; z: number }[];
  sound: { muted: boolean; volume: number; setMute(muted: boolean): void; setVolume(volume: number): void };
  /** Debug teleport: the region's places (stage/teleports.ts), the hero, and how to get there. */
  travel?: {
    spots(): Spot[];
    hero(): { x: number; y: number } | undefined;
    go(spot: Spot): void;
    level(): { region: string; state: string };
    goLevel(target: RegionTarget): void;
  };
}

export const CONTROLS: [string, string, string][] = [
  ['Walk (run after 0.4 s)', 'A / D, ← →', 'Stick, D-pad'],
  ['Interact, climb up', 'W, ↑', 'Up'],
  ['Drop through, climb down', 'S, ↓', 'Down'],
  ['Jump (hold for higher)', 'K, Z or Space', 'A / Cross'],
  ['Attack (tap) / guard (hold)', 'J, X or left click', 'X / Square'],
  ['Dodge-dash', 'L, C or Shift', 'B / Circle, RB'],
  ['Up attack', '↑ + attack', 'Up + X'],
  ['Low sweep (on the ground)', '↓ + attack', 'Down + X'],
  ['Down slam (in the air)', '↓ + attack', 'Down + X'],
  ['Pocket computer (map)', 'Tab', 'Back / Select'],
  ['This menu', 'Esc', 'Start'],
];

export const COMING = [
  'The Hidden Garden as a whole zone: above the pond, the banks and the drained reflection under it',
  'Rusty Creek rebuilt in four directions – the bridges above, the culverts and pump rooms below',
  'The poncho glide after Rusty Creek – updrafts off the water, gaps only a glide crosses',
  'More crabs and drones in the maze',
  'Lost in the Green, the Mensa, the Toxic Garden and the Playground',
  'Touch controls and rebindable keys',
];

type Tab = 'controls' | 'settings' | 'debug' | 'coming';
const TABS: [Tab, string][] = [['controls', 'Controls'], ['settings', 'Settings'], ['debug', 'Debug'], ['coming', 'Coming soon']];

export class GameMenu {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private body: HTMLDivElement;
  private button: HTMLButtonElement;
  private tab: Tab = 'controls';
  private open = false;
  private offStore: () => void;

  constructor(parent: HTMLElement, private host: MenuHost) {
    this.button = el('button', 'wm-open', '☰') as HTMLButtonElement;
    this.button.title = 'Menu (Esc)';
    this.button.setAttribute('aria-label', 'Open the menu');
    this.button.onclick = () => this.toggle();
    this.root = el('div', 'wm-root') as HTMLDivElement;
    this.root.hidden = true;
    this.root.onclick = event => { if (event.target === this.root) this.toggle(false); };
    this.panel = el('div', 'wm-panel') as HTMLDivElement;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Menu');
    const head = el('div', 'wm-head');
    head.append(el('span', 'wm-title', 'DEGGSTER.EXE – paused'));
    const actions = el('div', 'wm-row');
    // Back to the title screen (Lex, A17): a fresh start, so the story's state (Dexter, the crossing, the ending)
    // resets exactly as on first load.
    const title = el('button', 'wm-close', 'Back to title') as HTMLButtonElement;
    title.onclick = () => { if (window.confirm('Back to the title screen? Progress in this run is lost.')) location.reload(); };
    const close = el('button', 'wm-close', 'Resume ✕') as HTMLButtonElement;
    close.onclick = () => this.toggle(false);
    actions.append(title, close);
    head.append(actions);
    const tabs = el('div', 'wm-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of TABS) {
      const b = el('button', 'wm-tab', label) as HTMLButtonElement;
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.onclick = () => { this.tab = id; this.render(); };
      tabs.append(b);
    }
    this.body = el('div', 'wm-body') as HTMLDivElement;
    this.panel.append(head, tabs, this.body);
    this.root.append(this.panel);
    parent.append(this.button, this.root);
    this.offStore = debugStore.on(() => { if (this.open && this.tab === 'debug') this.render(); });
  }

  get isOpen() { return this.open; }

  toggle(open = !this.open) {
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
    this.host.pause(open);
    if (open) { this.render(); (this.panel.querySelector('.wm-tab[aria-selected="true"]') as HTMLElement | null)?.focus(); }
  }

  private render() {
    for (const b of Array.from(this.panel.querySelectorAll<HTMLButtonElement>('.wm-tab'))) b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    this.body.replaceChildren(...{ controls: () => this.controls(), settings: () => this.settings(),
      debug: () => this.debug(), coming: () => this.coming() }[this.tab]());
  }

  private controls(): HTMLElement[] {
    const table = el('table', 'wm-table');
    const head = el('tr');
    for (const h of ['', 'Keyboard', 'Gamepad']) head.append(el('th', '', h));
    table.append(head);
    for (const [action, keys, pad] of CONTROLS) {
      const row = el('tr');
      row.append(el('td', '', action), el('td', 'wm-key', keys), el('td', 'wm-key', pad));
      table.append(row);
    }
    return [table, el('p', 'wm-note', 'Two laptop layouts: WASD with J attack, K jump, L dodge – or the arrows with Z jump, X attack, C dodge. Touch controls are coming.')];
  }

  private settings(): HTMLElement[] {
    const sound = this.host.sound;
    const volume = el('input') as HTMLInputElement;
    Object.assign(volume, { type: 'range', min: '0', max: '1', step: '0.05', value: String(sound.volume) });
    volume.oninput = () => sound.setVolume(Number(volume.value));
    const zoom = el('div', 'wm-row');
    for (const z of ZOOMS) {
      const b = el('button', 'wm-chip', z === 1 ? 'Game view' : `${Math.round(100 / z)} % wider`) as HTMLButtonElement;
      b.setAttribute('aria-pressed', String(debugStore.state.zoom === z));
      b.onclick = () => { debugStore.set({ zoom: z }); this.render(); };
      zoom.append(b);
    }
    const full = el('button', 'wm-chip', document.fullscreenElement ? 'Leave full screen' : 'Full screen') as HTMLButtonElement;
    full.onclick = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
      .catch(() => undefined).finally(() => this.render()); };
    return [
      field('Sound', check(!sound.muted, 'On', on => sound.setMute(!on))),
      field('Volume', volume),
      field('Zoom', zoom),
      field('Screen', full),
    ];
  }

  private debug(): HTMLElement[] {
    const s = debugStore.state;
    const out: HTMLElement[] = [
      field('Debug mode', check(s.on, 'On – draws over the game; screenshots record what is on', on => debugStore.set({ on }))),
      field('Show', row(
        check(s.backdrop, 'Purple backdrop', v => debugStore.set({ backdrop: v })),
        check(s.collision, 'Collision', v => debugStore.set({ collision: v })),
        check(s.actors, 'Actors: boxes, facing, sight, paths', v => debugStore.set({ actors: v })),
        check(s.stats, 'FPS and position', v => debugStore.set({ stats: v })))),
    ];
    const layers = row(...this.host.layers().map(({ id, z }) =>
      check(!s.hidden.has(id), `z${z} ${id}`, () => debugStore.toggleLayer(id))));
    out.push(field('Layers', layers));
    const last = falls.at(-1);
    const fallInfo = el('div', 'wm-row');
    fallInfo.append(el('span', 'wm-note', last
      ? `${falls.length} fall${falls.length > 1 ? 's' : ''} out of the level – last at ${last.position.x}, ${last.position.y} in ${last.region}${import.meta.env.DEV ? ' (saved to tmp/falls/)' : ''}`
      : 'No falls out of the level yet. Each one is kept with a screenshot.'));
    if (last) {
      const save = el('button', 'wm-chip', 'Save the last one') as HTMLButtonElement;
      save.onclick = () => download(last);
      fallInfo.append(save);
    }
    out.push(field('Falls', fallInfo));
    const travel = this.host.travel;
    if (travel) {
      // Teleport closes the menu and moves the hero at once (playtests: straight to a checkpoint or the next level).
      const go = (spot: Spot | undefined) => { if (!spot) return; this.toggle(false); travel.go(spot); };
      const hero = travel.hero();
      const all = travel.spots();
      const step = (label: string, dir: 1 | -1) => {
        const b = chip(label, () => go(hero && nextSpot(all, hero, dir)));
        b.disabled = !hero || !nextSpot(all, hero, dir);
        return b;
      };
      out.push(field('Teleport', row(step('◀ Previous place', -1), step('Next checkpoint ▶', 1),
        ...all.map(spot => chip(spot.label, () => go(spot))))));
      const now = travel.level();
      const teleport = out[out.length - 1];
      out.push(field('Level', row(...LEVELS.map(level => {
        const b = chip(level.label, () => { this.toggle(false); travel.goLevel({ region: level.region, state: level.state }); });
        b.setAttribute('aria-pressed', String(level.region === now.region && level.state === now.state));
        return b;
      }))));
      // Like every other switch here, only while debug mode is on.
      if (!s.on) for (const f of [teleport, out[out.length - 1]]) for (const b of Array.from(f.querySelectorAll('button'))) b.disabled = true;
    }
    if (!s.on) for (const input of out.slice(1).flatMap(f => Array.from(f.querySelectorAll('input')))) input.disabled = true;
    return out;
  }

  private coming(): HTMLElement[] {
    const list = el('ul', 'wm-list');
    for (const item of COMING) list.append(el('li', '', item));
    return [list];
  }

  destroy() { this.offStore(); this.button.remove(); this.root.remove(); }
}

function el(tag: string, className = '', text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function check(value: boolean, label: string, change: (on: boolean) => void): HTMLElement {
  const wrap = el('label', 'wm-check');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = value;
  input.onchange = () => change(input.checked);
  wrap.append(input, el('span', '', label));
  return wrap;
}

function row(...children: HTMLElement[]): HTMLElement {
  const r = el('div', 'wm-row');
  r.append(...children);
  return r;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const f = el('div', 'wm-field');
  f.append(el('div', 'wm-label', label), control);
  return f;
}

function chip(label: string, click: () => void): HTMLButtonElement {
  const b = el('button', 'wm-chip', label) as HTMLButtonElement;
  b.onclick = click;
  return b;
}
