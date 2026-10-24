/** Phaser Key.onUp clears its press flag; a release with no observed down is still a complete tap. */
export function actionEdges(down: boolean, wasDown: boolean, pressFlag: boolean, releaseFlag: boolean) {
  return {
    pressed: pressFlag || (down || releaseFlag) && !wasDown,
    released: !down && (wasDown || releaseFlag),
  };
}

/**
 * A left click on the game itself attacks like J (playtest 24 Oct, laptops): only the left button, only on the
 * canvas (a click on the menu or any DOM over it is the UI's), and not a touch – touch controls come separately.
 */
export function attackClick(button: number, wasTouch: boolean, target: unknown, canvas: unknown) {
  return button === 0 && !wasTouch && target === canvas;
}

/**
 * A brief attack buffer (playtest 24 Oct): a press that cannot start yet – during the up attack's or the low sweep's
 * poses, a slam's landing, or a dodge-dash – is kept for 0.2 s and starts the moment the chair is free, instead of
 * being lost. One entry; a newer press replaces it. Damage or death clears it.
 */
export const ATTACK_BUFFER = 0.2;
export type BufferedAttack = 'tap' | 'up' | 'down';
export class AttackBuffer {
  private kind: BufferedAttack | undefined;
  private left = 0;
  get pending() { return this.kind; }
  hold(kind: BufferedAttack) { this.kind = kind; this.left = ATTACK_BUFFER; }
  step(dt: number) { this.left -= dt; if (this.left <= 1e-9) this.clear(); }
  take() { const kind = this.kind; this.clear(); return kind; }
  clear() { this.kind = undefined; this.left = 0; }
}
