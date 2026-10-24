import Phaser from 'phaser';
import { stageLayers, type StageManifest, type RegionState, type StageLayer } from './manifest';
import { textureKey } from './assets';
import { gridBounds } from './camera';
import { above, isForeground, layerDepth, layerRanks, LEAVES_BEHIND_DEPTH, LEAVES_FRONT_DEPTH } from './depth';
import { layerAtmosphere, parseAtmosphere, type Atmosphere, type LayerFx } from './atmosphere/config';
import { anchorProfile, autumnPalette, onScreen, waterline, waterlineAt, waterPoints, type Pixels, type WaterSpan } from './atmosphere/analysis';
import { WaterLife } from './atmosphere/water';
import { sheetAnimations } from './atmosphere/sprites';
import { layerPipeline, newUniforms, useLayerPipeline, type LayerUniforms } from './atmosphere/pipeline';
import { addLeaves, type LeafEmitters } from './atmosphere/leaves';
import { Reflection } from './atmosphere/reflection';

/** One drawn layer and what the atmosphere does with it. */
export interface DrawnLayer {
  image: Phaser.GameObjects.Image;
  layer: StageLayer;
  chunk: string;
  fx: LayerFx;
  uniforms: LayerUniforms;
  /** The art has been read (anchor profile, waterline); done lazily, visible layers first. */
  analysed: boolean;
}

export interface StageHandles {
  /** Every layer image in draw order (as before: drawStage(...).images). */
  images: Phaser.GameObjects.Image[];
  layers: DrawnLayer[];
  atmosphere: Atmosphere;
  leaves: LeafEmitters | null;
  /** True when the layers sway, blur and ripple (WebGL); false on Canvas, where the stage is still. */
  animated: boolean;
  /** World row of the waterline under world x, or null where there is no water. */
  waterlineAt(x: number): number | null;
  /** Mirror an actor in the water (the hero, Dexter); returns null where the stage has no water reflection. */
  reflect(sprite: Phaser.GameObjects.Sprite): Reflection | null;
  destroy(): void;
}

/** Half-size copies of layer art, read once – enough for anchors, waterlines and colours. */
const SAMPLE_SCALE = 2;
let canvas: HTMLCanvasElement | undefined;
function readPixels(scene: Phaser.Scene, key: string): Pixels | null {
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (!source?.width) return null;
  const width = Math.ceil(source.width / SAMPLE_SCALE), height = Math.ceil(source.height / SAMPLE_SCALE);
  canvas ??= document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return { width, height, data: context.getImageData(0, 0, width, height).data, scale: SAMPLE_SCALE };
}

/** Canvas renderer: no shader, so the foreground gets a pre-blurred copy (where the browser has ctx.filter). */
function canvasBlur(scene: Phaser.Scene, image: Phaser.GameObjects.Image, radius: number) {
  const key = `${image.texture.key}#blur${radius}`;
  if (!scene.textures.exists(key)) {
    const source = image.texture.getSourceImage() as HTMLImageElement;
    const texture = scene.textures.createCanvas(key, source.width, source.height);
    if (!texture) return;
    texture.context.filter = `blur(${radius}px)`;
    texture.context.drawImage(source, 0, 0);
    texture.refresh();
  }
  image.setTexture(key);
}

/**
 * Draw a region state: every layer in its order and scroll, z 0–5 behind the actors and z 6–7 over them
 * (depth.ts), then bring it to life from `atmosphereData` (atmosphere.json, `{}` for defaults): wind sway,
 * depth of field, water ripple and shimmer, falling leaves, reflections. Returns the handles.
 */
export function drawStage(scene: Phaser.Scene, manifest: StageManifest, state: RegionState, atmosphereData: unknown = {}): StageHandles {
  const { atmosphere, problems } = parseAtmosphere(atmosphereData, state);
  if (problems.length) console.warn(`atmosphere.json (${manifest.region}): ${problems.join('; ')}`);
  const pipeline = layerPipeline(scene.game);
  pipeline?.setWind(atmosphere.wind);

  const ranks = layerRanks(manifest.chunks.map(chunk => chunk.states[state]?.layers ?? []));
  const layers: DrawnLayer[] = stageLayers(manifest, state).map(layer => {
    const image = scene.add.image(layer.x, layer.y, textureKey(manifest.region, layer.file))
      .setOrigin(0).setScrollFactor(layer.scroll).setDepth(layerDepth(layer.z, ranks.get(layer.id)!));
    const fx = layerAtmosphere(atmosphere, layer);
    const uniforms = newUniforms();
    uniforms.sway.set([fx.sway, fx.reach, fx.foliage, fx.bob]);
    uniforms.water.set([-1, fx.ripple, fx.shimmer, fx.blur]);
    uniforms.place.set([layer.x, fx.anchor === 'top' ? 1 : 0]);
    const chunk = manifest.chunks.find(c => c.x * manifest.chunkSize[0] === layer.x && c.y * manifest.chunkSize[1] === layer.y)?.id ?? '';
    return { image, layer, chunk, fx, uniforms, analysed: false };
  });
  const bounds = gridBounds(manifest);
  scene.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);

  const waterId = atmosphere.water?.layer;
  const spans: WaterSpan[] = [];
  const moving = (d: DrawnLayer) => d.fx.sway > 0 || d.fx.ripple > 0 || d.fx.shimmer > 0 || d.fx.blur > 0 || d.layer.id === waterId;
  for (const d of layers) {
    if (!moving(d)) { d.analysed = true; continue; }
    if (pipeline) useLayerPipeline(d.image, d.uniforms);
    else if (d.fx.blur > 0) canvasBlur(scene, d.image, d.fx.blur);
  }
  const palette: number[] = [];
  const waterSheet = atmosphere.water && sheetAnimations(scene, 'fx-water');
  const waterDrawn = layers.find(d => d.layer.id === waterId);
  const life = waterSheet && waterDrawn ? new WaterLife(scene, waterSheet, atmosphere.water!, waterDrawn.image.depth) : null;
  const analyse = (d: DrawnLayer) => {
    d.analysed = true;
    const pixels = readPixels(scene, d.image.texture.key);
    if (!pixels) return;
    if (d.fx.sway > 0) anchorProfile(pixels, d.fx.anchor, d.uniforms.profile);
    if (d.layer.id === waterId) {
      const line = waterline(pixels);
      d.uniforms.water[0] = line;
      if (line >= 0) {
        spans.push({ x0: d.image.x, x1: d.image.x + d.image.width, y: d.image.y + line, image: d.image });
        spans.sort((a, b) => a.x0 - b.x0);
        if (life) {
          const points = waterPoints(pixels, line);
          life.addSurface(d.image.x, d.image.y, d.image.width, line, points.all, points.bright);
        }
      }
    }
    if (!palette.length && !isForeground(d.layer.z) && d.fx.sway > 0 && d.layer.scroll === 1) palette.push(...autumnPalette(pixels));
  };

  const camera = scene.cameras.main;
  const visible = (d: DrawnLayer) => onScreen(d.image.x, d.image.width, d.layer.scroll, camera.scrollX, camera.width)
    && onScreen(d.image.y, d.image.height, d.layer.scroll, camera.scrollY, camera.height);
  // The water everywhere (reflections need every span), then what is on screen now; the rest one per frame.
  for (const d of layers) if (!d.analysed && (d.layer.id === waterId || visible(d))) analyse(d);
  if (!palette.length) for (const d of layers) if (!isForeground(d.layer.z) && d.layer.scroll === 1 && d.layer.id !== waterId) {
    const pixels = readPixels(scene, d.image.texture.key);
    if (pixels) palette.push(...autumnPalette(pixels));
    break;
  }

  const leaves = atmosphere.leaves.front || atmosphere.leaves.behind
    ? addLeaves(scene, atmosphere.leaves, atmosphere.wind, palette, { front: LEAVES_FRONT_DEPTH, behind: LEAVES_BEHIND_DEPTH })
    : null;
  const reflections: Reflection[] = [];
  const water = waterDrawn;

  const frame = (time: number) => {
    // Layers off screen are not drawn (each would still cost a draw call).
    let pending = -1;
    for (let i = 0; i < layers.length; i++) {
      layers[i].image.visible = visible(layers[i]);
      if (pending < 0 && !layers[i].analysed) pending = i;
    }
    if (pending >= 0) analyse(layers[pending]);
    leaves?.update(time / 1000);
    life?.update(time, camera);
    for (let i = 0; i < reflections.length; i++) reflections[i].update();
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, frame);
  const handles: StageHandles = {
    images: layers.map(d => d.image), layers, atmosphere, leaves, animated: pipeline !== null,
    waterlineAt: x => waterlineAt(spans, x),
    reflect(sprite) {
      const reflect = atmosphere.water?.reflect;
      if (!reflect || !water || !pipeline) return null;
      const r = new Reflection(sprite, spans, reflect.alpha, reflect.tint, above(water.image.depth), pipeline);
      reflections.push(r);
      return r;
    },
    destroy() {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, frame);
      leaves?.destroy();
      life?.destroy();
      reflections.forEach(r => r.destroy());
      layers.forEach(d => d.image.destroy());
    },
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, frame));
  return handles;
}
