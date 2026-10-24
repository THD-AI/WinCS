import Phaser from 'phaser';
import { PROFILE_SIZE } from './analysis';
import { WIND_GLSL } from './wind';
import type { Wind } from './config';

/**
 * One WebGL pipeline for every moving stage layer: wind sway anchored to the art (the top of a plant
 * moves, its base does not; stone and wood stay put), a vertical bob, a depth-of-field blur, and the
 * water's ripple and shimmer below the waterline. Each object carries its own uniforms (LayerUniforms);
 * the pipeline loads them in onBind, so the layers share one shader and no frame allocates.
 */
export const PIPELINE = 'WincsStageLayer';

export interface LayerUniforms {
  /** amp px, reach px, foliage threshold, bob px */
  sway: Float32Array;
  /** waterline px (-1: none), ripple px, shimmer 0–1, blur px */
  water: Float32Array;
  /** world x of the layer's left edge (gust phase), anchor mode (0 base, 1 top) */
  place: Float32Array;
  profile: Float32Array;
  /** rim colour rgb 0–1, strength 0–1: a 1 px inner outline that lifts a sprite off a dark background */
  rim: Float32Array;
}

export const newUniforms = (): LayerUniforms => ({
  sway: new Float32Array(4), water: new Float32Array([-1, 0, 0, 0]), place: new Float32Array(2),
  profile: new Float32Array(PROFILE_SIZE), rim: new Float32Array(4),
});

const FRAG = /* glsl */ `
#define SHADER_NAME WINCS_STAGE_LAYER_FS
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define PROFILE ${PROFILE_SIZE}

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec4 uFrame;
uniform vec2 uSize;
uniform vec4 uSway;
uniform vec4 uWater;
uniform vec4 uWind;
uniform vec4 uWind2;
uniform float uProfile[PROFILE];
uniform vec4 uRim;

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
${WIND_GLSL}
float profileAt(float x) {
  float f = clamp(x / uSize.x, 0.0, 1.0) * float(PROFILE - 1);
  float i0 = floor(f);
  float a = 0.0;
  float b = 0.0;
  for (int i = 0; i < PROFILE; i++) {
    float fi = float(i);
    if (fi == i0) a = uProfile[i];
    if (fi == i0 + 1.0) b = uProfile[i];
  }
  if (i0 >= float(PROFILE - 1)) b = a;
  return mix(a, b, f - i0);
}

vec4 texel(vec2 px) {
  px = clamp(px, vec2(0.5), uSize - 0.5);
  return texture2D(uMainSampler, uFrame.xy + px / uSize * (uFrame.zw - uFrame.xy));
}

vec4 tap(vec2 px) {
  if (uWater.w <= 0.0) return texel(px);
  float r = uWater.w;
  vec4 c = texel(px) * 0.25;
  c += (texel(px + vec2(r, 0.0)) + texel(px - vec2(r, 0.0)) + texel(px + vec2(0.0, r)) + texel(px - vec2(0.0, r))) * 0.125;
  c += (texel(px + vec2(r, r)) + texel(px - vec2(r, r)) + texel(px + vec2(r, -r)) + texel(px - vec2(r, -r))) * 0.0625;
  return c;
}

float movable(vec4 c) {
  if (uSway.z <= 0.0 || c.a < 0.05) return 1.0;
  vec3 rgb = c.rgb / c.a;
  float hi = max(rgb.r, max(rgb.g, rgb.b));
  float lo = min(rgb.r, min(rgb.g, rgb.b));
  return smoothstep(uSway.z, uSway.z + 0.15, (hi - lo) / max(hi, 0.001));
}

void main () {
  vec2 px = (outTexCoord - uFrame.xy) / (uFrame.zw - uFrame.xy) * uSize;
  float t = uTime;
  vec4 c = tap(px);

  if (uSway.x > 0.0) {
    float anchor = profileAt(px.x);
    float height = uWind2.w > 0.5 ? uSway.y - (px.y - anchor) : anchor - px.y;
    float w = clamp(height / uSway.y, 0.0, 1.0);
    w = w * w * (3.0 - 2.0 * w);
    float wx = uWind2.z + px.x;
    vec2 d = vec2(uSway.x * w * swayAt(wx, height, t), uSway.w * w * sin(uWind2.x * 1.7 * t + wx * 0.03));
    vec4 moved = tap(px - d);
    c = mix(c, moved, min(movable(c), movable(moved)));
  }

  if (uWater.x >= 0.0 && px.y >= uWater.x) {
    float below = px.y - uWater.x;
    if (uWater.y > 0.0) {
      float depth = clamp(below / 120.0, 0.0, 1.0);
      float r = uWater.y * (0.35 + 0.65 * depth) * sin(px.y * 0.45 - t * 2.4 + sin(px.x * 0.012 + t * 0.6) * 1.6);
      vec4 rippled = tap(px - vec2(r, 0.0));
      if (rippled.a > 0.5) c = rippled;
    }
    if (uWater.z > 0.0 && c.a > 0.0) {
      vec3 rgb = c.rgb / c.a;
      float l = dot(rgb, vec3(0.299, 0.587, 0.114));
      float band = sin(px.y * 0.9 + t * 3.1 + sin(px.x * 0.02 - t) * 2.0);
      vec2 cell = floor(px / 3.0);
      float h = fract(sin(dot(cell, vec2(12.9898, 78.233)) + floor(t * 6.0) * 0.37) * 43758.5453);
      float spark = step(0.985, h) * smoothstep(0.5, 0.8, l);
      rgb += uWater.z * (0.06 * band * l + spark * 0.7);
      c.rgb = clamp(rgb, 0.0, 1.0) * c.a;
    }
  }

  if (uRim.w > 0.0 && c.a > 0.5) {
    float edge = step(texel(px + vec2(1.0, 0.0)).a, 0.5) + step(texel(px - vec2(1.0, 0.0)).a, 0.5)
      + step(texel(px + vec2(0.0, 1.0)).a, 0.5) + step(texel(px - vec2(0.0, 1.0)).a, 0.5);
    if (px.x < 1.0 || px.y < 1.0 || px.x > uSize.x - 1.0 || px.y > uSize.y - 1.0) edge += 1.0;
    c.rgb = mix(c.rgb, uRim.rgb * c.a, uRim.w * min(edge, 1.0));
  }

  vec4 tint = vec4(outTint.bgr * outTint.a, outTint.a);
  gl_FragColor = c * tint;
}
`;

const UNIFORMS = new WeakMap<Phaser.GameObjects.GameObject, LayerUniforms>();

export class LayerPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  /** Shared by every layer; set by the stage's atmosphere (wind is per region). */
  wind = new Float32Array([0.45, 0.9, 240, 1400]);
  wind2 = new Float32Array([0, -1]);
  private none = newUniforms();

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAG });
  }

  setWind(wind: Wind) {
    this.wind[0] = wind.base; this.wind[1] = wind.gust; this.wind[2] = wind.gustSpeed; this.wind[3] = wind.gustLength;
    this.wind2[0] = Math.PI * 2 * wind.frequency; this.wind2[1] = wind.direction;
  }

  onBind(gameObject?: Phaser.GameObjects.GameObject) {
    this.flush(); // the uniforms below belong to this object only
    const u = (gameObject && UNIFORMS.get(gameObject)) || this.none;
    const frame = (gameObject as Phaser.GameObjects.Image | undefined)?.frame;
    this.set1f('uTime', this.game.loop.time / 1000);
    if (frame) {
      this.set4f('uFrame', frame.u0, frame.v0, frame.u1, frame.v1);
      this.set2f('uSize', frame.cutWidth, frame.cutHeight);
    }
    this.set4f('uSway', u.sway[0], u.sway[1], u.sway[2], u.sway[3]);
    this.set4f('uWater', u.water[0], u.water[1], u.water[2], u.water[3]);
    this.set4f('uWind', this.wind[0], this.wind[1], this.wind[2], this.wind[3]);
    this.set4f('uWind2', this.wind2[0], this.wind2[1], u.place[0], u.place[1]);
    this.set1fv('uProfile', u.profile);
    this.set4f('uRim', u.rim[0], u.rim[1], u.rim[2], u.rim[3]);
  }
}

/** The pipeline on this game, registered on first use; null on the Canvas renderer. */
export function layerPipeline(game: Phaser.Game): LayerPipeline | null {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  if (!renderer.pipelines.has(PIPELINE)) renderer.pipelines.add(PIPELINE, new LayerPipeline(game));
  return renderer.pipelines.get(PIPELINE) as LayerPipeline;
}

/** Draw `object` through the layer pipeline with these uniforms. */
export function useLayerPipeline(object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, uniforms: LayerUniforms) {
  UNIFORMS.set(object, uniforms);
  object.setPipeline(PIPELINE);
}

/**
 * A 1 px warm rim inside a sprite's silhouette, so a dark actor (Dexter's black plush) reads against a
 * dark hedge. Works on any Image or Sprite, every frame of its atlas; a no-op on Canvas. Returns whether
 * it applied. `strength` 0 removes it.
 */
export function addRim(sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, colour = 0xffc878, strength = 0.65): boolean {
  if (!layerPipeline(sprite.scene.game)) return false;
  const uniforms = UNIFORMS.get(sprite) ?? newUniforms();
  uniforms.rim.set([((colour >> 16) & 255) / 255, ((colour >> 8) & 255) / 255, (colour & 255) / 255, strength]);
  useLayerPipeline(sprite, uniforms);
  return true;
}
