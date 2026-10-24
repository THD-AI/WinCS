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
