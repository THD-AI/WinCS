/** Phaser Key.onUp clears its press flag; a release with no observed down is still a complete tap. */
export function actionEdges(down: boolean, wasDown: boolean, pressFlag: boolean, releaseFlag: boolean) {
  return {
    pressed: pressFlag || (down || releaseFlag) && !wasDown,
    released: !down && (wasDown || releaseFlag),
  };
}
