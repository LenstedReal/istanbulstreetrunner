// Render pipeline for Expo GL.
//
// Expo GL's drawing buffer always has the physical screen size, so a lower
// internal resolution needs a render target: the scene is drawn into it, then one
// full-screen pass stretches it to the screen and does tone mapping (ACES), sRGB
// output, colour grade, vignette, grain, the hit flash and (high/ultra) bloom.
// When render targets are not usable the engine renders straight to the screen.
import * as THREE from "three";

import type { DeviceCaps, QualityProfile } from "../quality/profiles";

export interface PostParams {
  exposure: number;
  /** 0..1 white/red flash on hits. */
  flash: number;
  flashColor: THREE.Color;
  saturation: number;
  warmth: number;
  vignette: number;
}

// Every post shader carries this marker so a compile error can be traced to the pipeline.
export const POST_SHADER_MARK = "ist-post";

// Helper names start with "ist" because three.js adds its own GLSL (for example
// RRTAndODTFit for ACES) in front of a ShaderMaterial; a second function with the
// same name does not compile and leaves only the clear colour on screen.
const FULLSCREEN_VERT = /* glsl */ `
// ist-post
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `
// ist-post
uniform sampler2D tScene;
uniform vec2 texel;
uniform float threshold;
varying vec2 vUv;
void main() {
  // 4-tap box downsample, then a soft threshold on luminance.
  vec3 c = texture2D(tScene, vUv + texel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tScene, vUv + texel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tScene, vUv + texel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tScene, vUv + texel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(threshold, threshold + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
// ist-post
uniform sampler2D tInput;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  // 9-tap gaussian using linear sampling (5 fetches).
  vec3 c = texture2D(tInput, vUv).rgb * 0.227027;
  vec2 o1 = dir * 1.3846153846;
  vec2 o2 = dir * 3.2307692308;
  c += texture2D(tInput, vUv + o1).rgb * 0.3162162162;
  c += texture2D(tInput, vUv - o1).rgb * 0.3162162162;
  c += texture2D(tInput, vUv + o2).rgb * 0.0702702703;
  c += texture2D(tInput, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

const FINAL_FRAG = /* glsl */ `
// ist-post
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float bloomStrength;
uniform float exposure;
uniform float saturation;
uniform float warmth;
uniform float vignette;
uniform float grain;
uniform float time;
uniform float flash;
uniform vec3 flashColor;
uniform float grade;
varying vec2 vUv;

vec3 istRrtOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 istAces(vec3 color) {
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= exposure / 0.6;
  color = inM * color;
  color = istRrtOdtFit(color);
  color = outM * color;
  return clamp(color, 0.0, 1.0);
}
vec3 istToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float istHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (bloomStrength > 0.0) c += texture2D(tBloom, vUv).rgb * bloomStrength;
  c = istAces(c);
  if (grade > 0.5) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation);
    c *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);
    vec2 d = vUv - 0.5;
    c *= 1.0 - vignette * dot(d, d) * 1.6;
  }
  c = clamp(c, 0.0, 1.0);
  c = istToSRGB(c);
  if (grain > 0.0) c += (istHash(vUv * 731.0 + time) - 0.5) * grain;
  c = mix(c, flashColor, flash);
  gl_FragColor = vec4(c, 1.0);
}
`;

export interface PipelineOptions {
  profile: QualityProfile;
  caps: DeviceCaps;
  /** Skip MSAA (it failed the self-test on this device). */
  noMsaa?: boolean;
  /** Use 8-bit sRGB targets even if half float works (half float failed the self-test). */
  noHalfFloat?: boolean;
}

export class RenderPipeline {
  private sceneRT: THREE.WebGLRenderTarget;
  private brightRT: THREE.WebGLRenderTarget | null = null;
  private blurRT: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private finalMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial | null = null;
  private blurMat: THREE.ShaderMaterial | null = null;
  private bloom: number;
  readonly halfFloat: boolean;
  readonly msaa: number;
  private w = 1;
  private h = 1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    opts: PipelineOptions,
  ) {
    const p = opts.profile;
    this.halfFloat = opts.caps.halfFloat && !opts.noHalfFloat;
    this.msaa = opts.noMsaa ? 0 : p.msaa;
    this.bloom = this.halfFloat && p.post === "full" ? p.bloomScale : 0;
    this.w = width;
    this.h = height;
    this.sceneRT = this.makeTarget(width, height, this.msaa, true);

    if (this.bloom > 0) {
      const bw = Math.max(1, Math.floor(width / 4));
      const bh = Math.max(1, Math.floor(height / 4));
      this.brightRT = this.makeTarget(bw, bh, 0, false);
      this.blurRT = this.makeTarget(bw, bh, 0, false);
      this.brightMat = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: BRIGHT_FRAG,
        uniforms: { tScene: { value: null }, texel: { value: new THREE.Vector2(1 / width, 1 / height) }, threshold: { value: 0.85 } },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.blurMat = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: BLUR_FRAG,
        uniforms: { tInput: { value: null }, dir: { value: new THREE.Vector2() } },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
    }

    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FINAL_FRAG,
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tBloom: { value: this.brightRT?.texture ?? null },
        bloomStrength: { value: this.bloom > 0 ? 0.55 + this.bloom * 0.5 : 0 },
        exposure: { value: 1 },
        saturation: { value: 1.08 },
        warmth: { value: 0.025 },
        vignette: { value: 0.35 },
        grain: { value: p.grain ? 0.025 : 0 },
        time: { value: 0 },
        flash: { value: 0 },
        flashColor: { value: new THREE.Color(1, 1, 1) },
        grade: { value: p.post === "none" ? 0 : 1 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.finalMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private makeTarget(w: number, h: number, samples: number, depth: boolean) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: depth,
      stencilBuffer: false,
      samples,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    // 8-bit targets store sRGB so dark gradients do not band; the GPU converts on read and write.
    if (!this.halfFloat) rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }

  get size() {
    return { w: this.w, h: this.h };
  }

  setSize(width: number, height: number) {
    if (width === this.w && height === this.h) return;
    this.w = width;
    this.h = height;
    this.sceneRT.setSize(width, height);
    if (this.brightRT && this.blurRT) {
      const bw = Math.max(1, Math.floor(width / 4));
      const bh = Math.max(1, Math.floor(height / 4));
      this.brightRT.setSize(bw, bh);
      this.blurRT.setSize(bw, bh);
      (this.brightMat!.uniforms.texel.value as THREE.Vector2).set(1 / width, 1 / height);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera, post: PostParams, time: number) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    if (this.bloom > 0 && this.brightRT && this.blurRT && this.brightMat && this.blurMat) {
      this.brightMat.uniforms.tScene.value = this.sceneRT.texture;
      this.quad.material = this.brightMat;
      r.setRenderTarget(this.brightRT);
      r.render(this.quadScene, this.quadCam);

      const bw = this.brightRT.width;
      const bh = this.brightRT.height;
      this.quad.material = this.blurMat;
      this.blurMat.uniforms.tInput.value = this.brightRT.texture;
      (this.blurMat.uniforms.dir.value as THREE.Vector2).set(1 / bw, 0);
      r.setRenderTarget(this.blurRT);
      r.render(this.quadScene, this.quadCam);
      this.blurMat.uniforms.tInput.value = this.blurRT.texture;
      (this.blurMat.uniforms.dir.value as THREE.Vector2).set(0, 1 / bh);
      r.setRenderTarget(this.brightRT);
      r.render(this.quadScene, this.quadCam);
    }

    const u = this.finalMat.uniforms;
    u.exposure.value = post.exposure;
    u.flash.value = post.flash;
    (u.flashColor.value as THREE.Color).copy(post.flashColor);
    u.saturation.value = post.saturation;
    u.warmth.value = post.warmth;
    u.vignette.value = post.vignette;
    u.time.value = time % 100;
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.sceneRT.dispose();
    this.brightRT?.dispose();
    this.blurRT?.dispose();
    this.finalMat.dispose();
    this.brightMat?.dispose();
    this.blurMat?.dispose();
    this.quad.geometry.dispose();
  }
}

/** What the GPU behind this Expo GL context can do. Never throws. */
export function probeCaps(gl: WebGL2RenderingContext | WebGLRenderingContext): DeviceCaps {
  const caps: DeviceCaps = { renderTarget: true, halfFloat: false, maxSamples: 0, maxTextureSize: 2048, maxAnisotropy: 1 };
  try {
    const isGL2 = typeof (gl as WebGL2RenderingContext).texStorage2D === "function";
    caps.renderTarget = true;
    caps.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
    if (isGL2) {
      caps.halfFloat = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
      caps.maxSamples = Number(gl.getParameter((gl as WebGL2RenderingContext).MAX_SAMPLES)) || 0;
    }
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso) caps.maxAnisotropy = Number(gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1;
  } catch {
    // Keep conservative defaults.
  }
  return caps;
}

/**
 * Reads two pixels (street near the bottom, street further away) after a frame was
 * drawn. If both are black or exactly the clear colour, the final pass did not reach
 * the screen: a lit, tone-mapped street never matches the raw clear colour.
 * Returns null when reading is not supported.
 */
export function centerPixelLooksDrawn(
  gl: WebGL2RenderingContext | WebGLRenderingContext,
  w: number,
  h: number,
  clear?: { r: number; g: number; b: number },
): boolean | null {
  try {
    const sample = (y: number) => {
      const px = new Uint8Array(4);
      gl.readPixels(Math.floor(w / 2), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    // Bottom middle is street and runner, the middle is the street further away.
    const low = sample(h * 0.12);
    const mid = sample(h * 0.6);
    if (gl.getError() !== gl.NO_ERROR) return null;
    const black = (p: Uint8Array) => p[0] + p[1] + p[2] <= 12;
    const isClear = (p: Uint8Array) =>
      !!clear && Math.abs(p[0] - clear.r) <= 10 && Math.abs(p[1] - clear.g) <= 10 && Math.abs(p[2] - clear.b) <= 10;
    // Nothing but the clear colour (or black) on both rows means the final pass never reached the screen.
    if ((black(low) || isClear(low)) && (black(mid) || isClear(mid))) return false;
    return true;
  } catch {
    return null;
  }
}
