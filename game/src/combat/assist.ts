import { BODY_HEIGHT } from '../player/body';
import { SWEEP_CONTACT, type Rect } from './sweeps';
import { UP_CONTACT } from './overhead';

/**
 * Target assist for the chair (Alexander, 24 Oct): an assist, not a lock-on. When an attack starts it looks for the
 * nearest live enemy close by and helps a little – it turns the hero to one just behind him, nudges him a few px
 * toward one just out of reach, and turns a plain tap under a hovering drone into the up attack. Pure, so the pick
 * is tested; chair.ts applies it and player.ts moves the nudge with the normal wall and floor collision.
 */
export const ASSIST = {
  /** Ahead: up to 1.4x the attack's reach from the feet (91 px for the side swing). */
  ahead: 1.4,
  /** Behind: an enemy this close behind (px from the feet) turns the hero round. */
  behind: 40,
  /** Vertically within one body height of the body (76 px). */
  vertical: BODY_HEIGHT,
  /** The nudge toward a target just out of reach: at most 24 px, over 0.1 s, aiming 8 px inside the reach. */
  lunge: 24, lungeTime: 0.1, margin: 8,
} as const;

export interface AssistPick {
  target: Rect;
  /** The way to strike: toward the target. */
  direction: -1 | 1;
  /** The hero turns round (the target is behind him). */
  turn: boolean;
  /** Px to nudge toward the target (0 when it is already in reach). */
  lunge: number;
  /** Above the side swing, in the up attack's cone: strike up instead. */
  up: boolean;
}

/**
 * The target for an attack starting now. `kind` is the attack the press asked for: 'sweep' (a plain tap, which may
 * become 'up' under a drone), 'low' (along the floor) or 'up'. `reach` is that attack's forward reach (px).
 */
export function pickAssist(feet: { x: number; y: number }, facing: -1 | 1, targets: Iterable<Rect>,
  kind: 'sweep' | 'low' | 'up', reach: number = SWEEP_CONTACT.reach): AssistPick | undefined {
  let best: (AssistPick & { gap: number }) | undefined;
  const bodyTop = feet.y - BODY_HEIGHT;
  for (const box of targets) {
    const centre = box.x + box.w / 2;
    const direction = (Math.sign(centre - feet.x) || facing) as -1 | 1;
    const gap = Math.max(0, direction > 0 ? box.x - feet.x : feet.x - (box.x + box.w));
    const vertical = Math.max(0, bodyTop - (box.y + box.h), box.y - feet.y);
    if (vertical > ASSIST.vertical) continue;
    const behind = direction !== facing;
    const aboveSwing = box.y + box.h <= feet.y - SWEEP_CONTACT.top;
    const inUpCone = box.y + box.h > feet.y - UP_CONTACT.top && box.y < feet.y - UP_CONTACT.bottom
      && Math.abs(centre - feet.x) <= UP_CONTACT.right;
    let up = false, lunge = 0;
    if (kind === 'up' || kind === 'sweep' && aboveSwing) {
      if (!inUpCone || behind && gap > ASSIST.behind) continue;
      up = true;
    } else {
      if (kind === 'low' && box.y + box.h <= feet.y - BODY_HEIGHT / 2) continue; // the floor strike ignores fliers
      if (gap > (behind ? ASSIST.behind : ASSIST.ahead * reach)) continue;
      lunge = Math.min(ASSIST.lunge, Math.max(0, gap - (reach - ASSIST.margin)));
    }
    const pick = { target: box, direction, turn: behind, lunge, up, gap };
    if (!best || gap < best.gap || gap === best.gap && best.turn && !behind) best = pick;
  }
  if (!best) return undefined;
  const { gap: _gap, ...pick } = best;
  return pick;
}

/** The nudge itself: a short, even push the player's substeps move through the normal collision. */
export class Lunge {
  remaining = 0;
  private speed = 0;
  start(distance: number) {
    if (Math.abs(distance) < 1e-9) return;
    this.remaining = ASSIST.lungeTime; this.speed = distance / ASSIST.lungeTime;
  }
  cancel() { this.remaining = 0; }
  /** Px to move in dt (signed). */
  step(dt: number) {
    const active = Math.min(dt, this.remaining);
    this.remaining = Math.max(0, this.remaining - active);
    if (this.remaining < 1e-9) this.remaining = 0;
    return this.speed * active;
  }
}
