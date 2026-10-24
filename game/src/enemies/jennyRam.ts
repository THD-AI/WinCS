import { JENNY_BOX } from './jenny';

/**
 * Jenny's ram on the clean creek path (docs/03 region 1, #54, P5) as one readable event, timed in seconds:
 * her headlights and engine come first (the tell), she rolls into view revving, charges down the path, hits the
 * hero and throws him the way she drives, and the frame breaks into the crash crossing. All before ~6 s.
 */
export const RAM = {
  /** The silence before her (#160): the music stops, the hero stands, nothing moves yet. */
  hush: 1.2,
  /** Lights and engine only: she is still beyond the right edge. */
  lights: 0.6,
  /** She rolls into view and revs at the edge. */
  rev: 0.6,
  /** Charge speed along the path (px/s). */
  speed: 900,
  /** The throw before the frame breaks. */
  throw: 0.45,
  /** How far the hit throws the hero along her direction of travel (px), and how high the arc rises. */
  throwDistance: 220,
  throwHeight: 90,
  /** Where she enters: this far beyond the view's right edge (px). */
  offscreen: 180,
  /** Where she revs: her centre this far inside the right edge. */
  revInset: 60,
} as const;

export interface RamPlan {
  /** Her centre x at each step. */
  startX: number; revX: number; impactX: number;
  /** Seconds from the trigger. */
  revAt: number; chargeAt: number; impactAt: number; crossAt: number;
}

/**
 * The ram for a hero standing at `heroX` with the view's right edge at `viewRight`: she drives right to left, so
 * the impact is where her nose (the left end of her body box) meets the hero's leading edge.
 */
export function ramPlan(heroX: number, viewRight: number, heroHalfWidth = 14): RamPlan {
  const startX = viewRight + RAM.offscreen;
  const revX = Math.max(heroX + JENNY_BOX.w, viewRight - RAM.revInset);
  const impactX = heroX + heroHalfWidth + JENNY_BOX.w / 2;
  const revAt = RAM.hush + RAM.lights;
  const chargeAt = revAt + RAM.rev;
  const impactAt = chargeAt + Math.max(0, revX - impactX) / RAM.speed;
  return { startX, revX, impactX, revAt, chargeAt, impactAt, crossAt: impactAt + RAM.throw };
}

/** Everything the ram shows `t` seconds after the trigger: pure, so the choreography is tested and replayable. */
export interface RamFrame {
  phase: 'hush' | 'lights' | 'rev' | 'charge' | 'thrown' | 'cross';
  /** Her centre x and frame name (boss-jenny atlas, 12 fps clips). */
  jennyX: number; jennyFrame: string;
  /** Headlight alpha 0…1 and the x of the lamps (the right edge before she is seen, her nose after). */
  lights: number; lightsX: number;
  /** The hero thrown: undefined before the hit. */
  hero?: { x: number; y: number; angle: number; frame: string };
}

export function ramFrame(t: number, plan: RamPlan, hero: { x: number; y: number }, viewRight: number): RamFrame {
  const clip = (name: string, since: number, loop = true) => {
    const n = Math.floor(Math.max(0, t - since) * 12);
    return `${name}-0${loop ? n % 4 : Math.min(3, n)}`;
  };
  const nose = (x: number) => Math.min(viewRight - 8, x - JENNY_BOX.w / 2);
  if (t < RAM.hush) {
    return { phase: 'hush', jennyX: plan.startX, jennyFrame: clip('rev', 0), lights: 0, lightsX: viewRight - 8 };
  }
  if (t < plan.revAt) {
    const k = (t - RAM.hush) / RAM.lights;
    return { phase: 'lights', jennyX: plan.startX, jennyFrame: clip('rev', 0), lights: k * k, lightsX: viewRight - 8 };
  }
  if (t < plan.chargeAt) {
    const k = Math.min(1, (t - plan.revAt) / (RAM.rev * 0.6));
    const x = plan.startX + (plan.revX - plan.startX) * (1 - (1 - k) * (1 - k));
    return { phase: 'rev', jennyX: x, jennyFrame: clip('rev', plan.revAt), lights: 1, lightsX: nose(x) };
  }
  if (t < plan.impactAt) {
    const x = plan.revX - (t - plan.chargeAt) * RAM.speed;
    return { phase: 'charge', jennyX: x, jennyFrame: clip('charge', plan.chargeAt), lights: 1, lightsX: nose(x) };
  }
  // She skids on along the path, braking, while the hero flies ahead of her.
  const s = Math.min(1, (t - plan.impactAt) / RAM.throw);
  const x = plan.impactX - RAM.throwDistance * 0.6 * (1 - (1 - s) * (1 - s));
  const thrown = thrownAt(t - plan.impactAt, hero, -1);
  return {
    phase: t < plan.crossAt ? 'thrown' : 'cross', jennyX: x, jennyFrame: clip('crash', plan.impactAt, false),
    lights: 1 - s * 0.6, lightsX: x - JENNY_BOX.w / 2,
    hero: { ...thrown, frame: `hit-0${Math.min(7, Math.floor((t - plan.impactAt) * 12))}` },
  };
}

/** The hero's thrown position `t` seconds after the hit (t in 0…RAM.throw): along her travel, in an arc. */
export function thrownAt(t: number, hero: { x: number; y: number }, direction: -1 | 1): { x: number; y: number; angle: number } {
  const k = Math.min(1, Math.max(0, t / RAM.throw));
  const ease = 1 - (1 - k) * (1 - k);
  return {
    x: hero.x + direction * RAM.throwDistance * ease,
    y: hero.y - RAM.throwHeight * 4 * k * (1 - k),
    angle: direction * 25 * k,
  };
}
