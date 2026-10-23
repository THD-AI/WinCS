export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/** Prefer whole pixels; smaller windows still fit the complete game view. */
export function displayScale(width: number, height: number): number {
  const fit = Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT);
  return fit >= 1 ? Math.floor(fit) : Math.max(0.01, fit);
}
