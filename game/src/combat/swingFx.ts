/**
 * The chair's swing made visible (playtest 24 Oct: the attack was "barely noticeable as an attack"). A pale arc
 * sweeps in front of the hero through the swing frames, brightest on the contact frame (sweep A 04, B 03), drawn
 * around the shoulder so it covers the measured sweep reach (SWEEP_CONTACT, 12–50 px ahead, from the floor to 87 px up). Pure, so
 * the timing and the mirroring are unit-tested.
 */
export const SWING = {
  /** Arc centre above the feet (px), its radius and thickness (px). */
  shoulder: 63, radius: 44, width: 12,
  /** Facing right, the arc spans these angles (degrees, 0 = ahead, positive = down). */
  from: -75, to: 62,
  /** The frames that draw the arc, and its opacity per frame (contact frame brightest). */
  alpha: { 'sweep-a': [0, 0, 0.35, 0.65, 1, 0.55, 0.2, 0], 'sweep-b': [0, 0.35, 0.7, 1, 0.55, 0.2, 0, 0] } as Record<string, number[]>,
} as const;

export interface Arc { x: number; y: number; radius: number; width: number; start: number; end: number; alpha: number }

/** The arc for a sweep phase and frame at the hero's feet, or undefined when nothing shows. Angles in radians. */
export function swingArc(phase: string, frame: number, direction: -1 | 1, feet: { x: number; y: number }): Arc | undefined {
  const alpha = SWING.alpha[phase]?.[frame] ?? 0;
  if (alpha <= 0) return undefined;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  // Mirrored for a left swing: an angle a on the right is 180° − a on the left.
  const [a, b] = direction > 0 ? [SWING.from, SWING.to] : [180 - SWING.to, 180 - SWING.from];
  return { x: feet.x, y: feet.y - SWING.shoulder, radius: SWING.radius, width: SWING.width, start: rad(a), end: rad(b), alpha };
}
