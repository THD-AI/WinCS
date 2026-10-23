import Phaser from 'phaser';
import { imageCut, pixelStretch, Rect, tornOutline } from './anomalyLayout';

/**
 * The anomaly language from docs/06, applied over a stage layer. Each effect is built once from cropped
 * copies of the layer's own texture or one static drawing, so nothing redraws per frame (#37).
 * Areas are in the layer's texture pixels; the copies inherit its position, scroll factor and depth.
 */

const C = { void: 0x9a9a9a, voidEdge: 0x6e6e6e, icon: 0xf4f4f4, iconLine: 0x5a5a5a, sky: 0x8fb7d9, hill: 0x6aa36f };

function copyOf(layer: Phaser.GameObjects.Image, depthOffset: number): Phaser.GameObjects.Image {
  return layer.scene.add.image(layer.x, layer.y, layer.texture.key, layer.frame.name)
    .setOrigin(0)
    .setScrollFactor(layer.scrollFactorX, layer.scrollFactorY)
    .setDepth(layer.depth + depthOffset);
}

/** Image cut: the area shifted sideways by `shift` px and repeated `copies` times. */
export function addImageCut(layer: Phaser.GameObjects.Image, area: Rect, shift: number, copies = 2): Phaser.GameObjects.Image[] {
  return imageCut(area, shift, copies).map((s, i) => copyOf(layer, 0.01 * (i + 1))
    .setCrop(s.sx, s.sy, s.sw, s.sh)
    .setPosition(layer.x + s.dx - s.sx, layer.y + s.dy - s.sy));
}

/** Pixel stretch: one row of the area (rowOffset px from its top) smeared down the whole area. */
export function addPixelStretch(layer: Phaser.GameObjects.Image, area: Rect, rowOffset = 0): Phaser.GameObjects.Image {
  const { row, scaleY } = pixelStretch(area, rowOffset);
  return copyOf(layer, 0.01)
    .setScale(1, scaleY)
    .setCrop(row.sx, row.sy, row.sw, row.sh)
    .setPosition(layer.x + row.dx - row.sx, layer.y + row.dy - row.sy * scaleY);
}

/** 404 void: flat grey with torn edges and the broken-image icon in the middle, drawn once. */
export function add404Void(layer: Phaser.GameObjects.Image, area: Rect, seed = 404): Phaser.GameObjects.Graphics {
  const g = layer.scene.add.graphics({ x: layer.x, y: layer.y })
    .setScrollFactor(layer.scrollFactorX, layer.scrollFactorY)
    .setDepth(layer.depth + 0.01);
  const outline = tornOutline(area, seed).map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(C.void).fillPoints(outline, true);
  g.lineStyle(2, C.voidEdge).strokePoints(outline, true);
  brokenImageIcon(g, area.x + area.w / 2, area.y + area.h / 2);
  return g;
}

/** The old browser's broken-image icon: a page with a folded corner, a tiny landscape, torn across. */
function brokenImageIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const w = 32;
  const h = 36;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  const fold = 9;
  const page = [[x, y], [x + w - fold, y], [x + w, y + fold], [x + w, y + h], [x, y + h]].map(([px, py]) => new Phaser.Math.Vector2(px, py));
  g.fillStyle(C.icon).fillPoints(page, true);
  g.fillStyle(C.sky).fillRect(x + 5, y + 12, w - 10, 10);
  g.fillStyle(C.hill).fillTriangle(x + 5, y + 22, x + 14, y + 14, x + 21, y + 22);
  g.lineStyle(2, C.iconLine).strokePoints(page, true);
  g.lineBetween(x + w - fold, y, x + w - fold, y + fold).lineBetween(x + w - fold, y + fold, x + w, y + fold);
  // The tear: a jagged line across the page, the lower half nudged right.
  g.lineStyle(2, C.void).lineBetween(x - 2, y + 26, x + 8, y + 23).lineBetween(x + 8, y + 23, x + 16, y + 28)
    .lineBetween(x + 16, y + 28, x + 24, y + 24).lineBetween(x + 24, y + 24, x + w + 2, y + 27);
}
