import type { ExpoWebGLRenderingContext } from "expo-gl";
import { Platform } from "react-native";
import * as THREE from "three";

import type { RunnerLook } from "../wardrobe";
import {
  CRASH_DELAY,
  DESPAWN_BEHIND,
  FIRST_ROW_Z,
  GRAVITY,
  HUD_INTERVAL,
  JUMP_VY,
  LANE_LERP,
  LANE_W,
  MAGNET_RANGE,
  MAX_SPEED,
  PLAYER_H,
  PLAYER_HALF_D,
  PLAYER_HALF_W,
  POWERUP_TIME,
  ROLL_H,
  ROLL_TIME,
  SPAWN_AHEAD,
  SPEED_INTERVAL,
  SPEED_STEP,
  START_SPEED,
} from "./constants";
import { DISTRICTS, type DistrictId } from "./districts";
import { OBSTACLE_DEFS, ObjectFactory, type ObstacleDef, type ObstacleKind, type PowerupKind } from "./objects";
import { planRow, type Lane } from "./patterns";
import { internalSize, type DeviceCaps, type QualityProfile, PROFILES } from "./quality/profiles";
import { FpsMeter, initialScale, updateScale, type ScaleState } from "./quality/scale";
import { centerPixelLooksDrawn, probeCaps, RenderPipeline, type PostParams } from "./render/pipeline";
import { createRng, randomSeed, type Rng } from "./rng";
import { DEFAULT_LOOK, Runner } from "./runner";
import { plan as planSteps, skipFrame, STEP } from "./timestep";
import { CityWorld } from "./world";

export type GameInput = "left" | "right" | "jump" | "roll";
export type GameEvent = "lane" | "jump" | "roll" | "coin" | "key" | "powerup" | "shield-break" | "crash" | "stumble" | "token" | "wings" | "carpet";
export type TimedPowerup = "magnet" | "x2" | "wings" | "carpet";

export interface HudState {
  score: number;
  coins: number;
  keys: number;
  multiplier: number;
  distance: number;
  speedKmh: number;
  powerup: { kind: TimedPowerup; remaining: number; total: number } | null;
  shield: boolean;
  /** Seconds left on the seagull chase after a stumble (0 = calm). */
  stumble: number;
}

export interface RunStats {
  jumps: number;
  rolls: number;
  powerups: number;
}

export interface RunResult {
  score: number;
  coins: number;
  distance: number;
  durationMs: number;
  district: DistrictId;
  reason: "crash" | "caught";
  token: boolean;
  stats: RunStats;
}

export interface EngineCallbacks {
  onHud: (s: HudState) => void;
  /** Player crashed; the UI decides between revive (keys / ad) and endRun(). */
  onCrash: (r: RunResult) => void;
  onGameOver: (r: RunResult) => void;
  onEvent: (e: GameEvent) => void;
  /** First time an obstacle kind comes into view in this run (for hints). */
  onObstacleSeen?: (kind: ObstacleKind) => void;
  /** Average FPS of the first seconds of a run (automatic quality). */
  onBenchmark?: (fps: number) => void;
  /** The post-processing pipeline failed its self-test and the engine fell back. */
  onGraphicsFallback?: (reason: "pipeline") => void;
}

export interface EngineOptions {
  profile: QualityProfile;
  fps: 30 | 60;
  look?: RunnerLook;
  benchmark?: boolean;
}

export interface RunOptions {
  district?: DistrictId;
  seed?: number;
  /** Distance where this run's ferry token piece appears (null = none). */
  tokenAt?: number | null;
}

type Phase = "idle" | "running" | "paused" | "crashing" | "crashed" | "over";

interface Obstacle {
  def: ObstacleDef;
  group: THREE.Group;
  x: number;
  z: number;
  lane: Lane;
  seen: boolean;
  phase: number;
}
interface Coin {
  x: number;
  y: number;
  z: number;
  baseY: number;
  phase: number;
  rot: number;
  attracted: boolean;
}
interface Pickup {
  kind: PowerupKind | "key" | "token";
  group: THREE.Group;
  baseY: number;
  phase: number;
}
interface Sparkle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

const MAX_COINS = 220;
const MOVE_ACTIVATION = 32;
const STUMBLE_TIME = 8;
const WINGS_HEIGHT = 5.6;

// Shadows can be turned off on a live renderer, but turning them back on crashes
// Expo GL ("WeakMap key" in drawBuffers). Turning on needs a new GL view; the
// screen remounts it from the menu. This flag survives route remounts.
let sessionShadowMode: boolean | null = null;
/** The pipeline failed its self-test in this process: render straight to the screen. */
let pipelineBroken = false;

export function getSessionShadowMode(preference: boolean): boolean {
  if (sessionShadowMode === null) sessionShadowMode = preference;
  return sessionShadowMode;
}

/** Called before a GL view remount so a new renderer may enable shadows again. */
export function resetSessionShadowMode(preference: boolean) {
  sessionShadowMode = preference;
}

export class RunnerEngine {
  private renderer: THREE.WebGLRenderer;
  private pipeline: RenderPipeline | null = null;
  private caps: DeviceCaps;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private factory = new ObjectFactory();
  private world: CityWorld;
  private runner: Runner;
  private gull: { group: THREE.Group; wingL: THREE.Object3D; wingR: THREE.Object3D };
  private coinMesh: THREE.InstancedMesh;
  private profile: QualityProfile;
  private fpsCap: 30 | 60;

  private phase: Phase = "idle";
  private raf = 0;
  private lastTime = 0;
  private lastRender = 0;
  private acc = 0;
  private clock = 0;
  private hudAcc = 0;
  private disposed = false;
  private lastIdleFrame = -Infinity;
  private scaleState: ScaleState = initialScale();
  private bench: FpsMeter | null = null;
  private selfTestFrames = 0;
  private screenW = 1;
  private screenH = 1;

  // Run state
  private rng: Rng = createRng(randomSeed());
  private district: DistrictId = "istiklal";
  private elapsed = 0;
  private speed = START_SPEED;
  private distance = 0;
  private score = 0;
  private coins = 0;
  private lane: Lane = 0;
  private prevLane: Lane = 0;
  private px = 0;
  private py = 0;
  private pz = 0;
  private vy = 0;
  private jumping = false;
  private rolling = false;
  private rollT = 0;
  private crashT = 0;
  private crashReason: RunResult["reason"] = "crash";
  private invulnerable = 0;
  private shake = 0;
  private flash = 0;
  private flashColor = new THREE.Color(1, 1, 1);
  private shield = false;
  private powerup: { kind: TimedPowerup; remaining: number; total: number } | null = null;
  private stumbleT = 0;
  private landing = 0;
  private nextRowZ = FIRST_ROW_Z;
  private stats: RunStats = { jumps: 0, rolls: 0, powerups: 0 };
  private seenKinds = new Set<ObstacleKind>();
  private tokenAt: number | null = null;
  private tokenSpawned = false;
  private tokenTaken = false;

  private obstacles: Obstacle[] = [];
  private coinList: Coin[] = [];
  private pickups: Pickup[] = [];
  private sparkles: Sparkle[] = [];
  private sparklePool: THREE.Mesh[] = [];
  private runKeys = 0;
  private nextKeyAt = 1700;
  private keyPending = false;
  private pool = new Map<string, THREE.Object3D[]>();
  private dummy = new THREE.Object3D();
  private post: PostParams = { exposure: 1.05, flash: 0, flashColor: new THREE.Color(1, 1, 1), saturation: 1.08, warmth: 0.025, vignette: 0.35 };

  constructor(
    private gl: ExpoWebGLRenderingContext,
    private cb: EngineCallbacks,
    shadowsEnabled: boolean = true,
    opts: EngineOptions = { profile: PROFILES.medium, fps: 60 },
  ) {
    this.profile = opts.profile;
    this.fpsCap = opts.fps;
    const useShadows = shadowsEnabled && this.profile.shadowMap > 0;
    sessionShadowMode = useShadows;
    this.caps = probeCaps(gl as unknown as WebGL2RenderingContext);
    this.screenW = Math.max(1, gl.drawingBufferWidth);
    this.screenH = Math.max(1, gl.drawingBufferHeight);
    this.renderer = this.createRenderer(gl, useShadows);
    this.buildPipeline();

    const def = DISTRICTS[this.district];
    this.scene.background = new THREE.Color(def.haze);
    this.scene.fog = new THREE.Fog(def.fog, this.profile.fogStart, this.profile.viewDistance);
    this.camera = new THREE.PerspectiveCamera(80, this.screenW / this.screenH, 0.1, this.profile.viewDistance + 260);

    this.hemi = new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity * 0.75);
    this.sun.castShadow = useShadows;
    const sm = Math.max(512, this.profile.shadowMap || 1024);
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 120;
    this.scene.add(this.sun, this.sun.target);

    this.world = new CityWorld(this.scene, this.factory, {
      detail: this.profile.detail,
      anisotropy: Math.min(this.profile.anisotropy, this.caps.maxAnisotropy),
      viewDistance: this.profile.viewDistance,
    });
    this.runner = new Runner(this.factory, opts.look ?? DEFAULT_LOOK);
    this.scene.add(this.runner.group);
    this.gull = this.factory.makeSeagull();
    this.gull.group.visible = false;
    this.scene.add(this.gull.group);

    const coin = this.factory.makeCoinGeometry();
    this.coinMesh = new THREE.InstancedMesh(coin.geometry, coin.material, MAX_COINS);
    this.coinMesh.count = 0;
    this.coinMesh.castShadow = useShadows;
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);

    const sparkles = this.profile.particles === "full" ? 32 : this.profile.particles === "reduced" ? 14 : 0;
    for (let i = 0; i < sparkles; i++) {
      const m = new THREE.Mesh(this.factory.sparkleGeo, this.factory.sparkleMat);
      m.visible = false;
      this.scene.add(m);
      this.sparklePool.push(m);
    }
    if (opts.benchmark) this.bench = new FpsMeter();

    this.applyDistrictLight();
    this.resetRun();
    this.updateCamera(1, true);
    this.loop(0);
  }

  // ------------------------------------------------------------- renderer
  /**
   * Rebind the renderer when Expo GL recreates its native context. Keep this
   * engine instance (and the run state) instead of starting over.
   */
  replaceContext(gl: ExpoWebGLRenderingContext) {
    if (this.disposed) return;

    if (this.gl === gl) {
      this.lastTime = 0;
      this.renderFrame();
      if (this.phase === "running" || this.phase === "crashing" || this.phase === "idle") this.ensureLoop();
      return;
    }

    this.stopLoop();
    const previousRenderer = this.renderer;
    const previousPipeline = this.pipeline;
    const shadowsEnabled = previousRenderer.shadowMap.enabled;
    const nextRenderer = this.createRenderer(gl, shadowsEnabled);
    this.gl = gl;
    this.renderer = nextRenderer;
    this.sun.castShadow = shadowsEnabled;
    this.screenW = Math.max(1, gl.drawingBufferWidth);
    this.screenH = Math.max(1, gl.drawingBufferHeight);
    this.camera.aspect = this.screenW / this.screenH;
    this.camera.updateProjectionMatrix();
    this.lastTime = 0;
    this.lastIdleFrame = -Infinity;
    try {
      previousPipeline?.dispose();
    } catch {
      // A lost context can make disposal throw; the new pipeline is built below.
    }
    this.pipeline = null;
    this.buildPipeline();
    try {
      previousRenderer.dispose();
    } catch {
      // Ignore a stale/lost GL context during replacement.
    }
    this.renderFrame();
    if (this.phase === "running" || this.phase === "crashing" || this.phase === "idle") this.ensureLoop();
  }

  private createRenderer(gl: ExpoWebGLRenderingContext, shadowsEnabled: boolean): THREE.WebGLRenderer {
    const w = Math.max(1, gl.drawingBufferWidth);
    const h = Math.max(1, gl.drawingBufferHeight);
    const fakeCanvas = {
      width: w,
      height: h,
      clientWidth: w,
      clientHeight: h,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
    };
    const canvas = ((gl as unknown as { canvas?: HTMLCanvasElement }).canvas ?? fakeCanvas) as HTMLCanvasElement;

    // expo-gl's native context inherits from a global `WebGLRenderingContext` shim,
    // which makes three.js (r163+) believe it is WebGL 1 and throw. The context is
    // really WebGL 2, so hide the global while the renderer is constructed.
    const g = globalThis as unknown as { WebGLRenderingContext?: unknown };
    const savedCtor = g.WebGLRenderingContext;
    let renderer: THREE.WebGLRenderer;
    if (Platform.OS !== "web") g.WebGLRenderingContext = undefined;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl as unknown as WebGL2RenderingContext,
        antialias: false,
        powerPreference: "high-performance",
      });
    } finally {
      g.WebGLRenderingContext = savedCtor;
    }

    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setClearColor(DISTRICTS[this.district ?? "istiklal"].haze);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = this.profile.shadowMap >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    return renderer;
  }

  private buildPipeline() {
    this.pipeline = null;
    if (pipelineBroken || !this.caps.renderTarget) return;
    try {
      const size = internalSize(this.screenW, this.screenH, this.profile, this.scaleState.scale);
      this.pipeline = new RenderPipeline(this.renderer, size.w, size.h, { profile: this.profile, caps: this.caps });
      this.selfTestFrames = 0;
    } catch (error) {
      console.warn("[gfx] pipeline unavailable", error);
      this.pipeline = null;
      pipelineBroken = true;
      this.cb.onGraphicsFallback?.("pipeline");
    }
  }

  /** Current internal resolution, for the debug line in Settings. */
  get renderInfo() {
    const size = this.pipeline?.size ?? { w: this.screenW, h: this.screenH };
    return { width: size.w, height: size.h, scale: this.scaleState.scale, pipeline: !!this.pipeline, profile: this.profile.id };
  }

  private renderFrame() {
    if (this.disposed) return;
    this.draw();
    this.gl.endFrameEXP?.();
  }

  private draw() {
    if (this.pipeline) {
      this.post.flash = this.flash;
      this.post.flashColor.copy(this.flashColor);
      try {
        this.pipeline.render(this.scene, this.camera, this.post, this.clock);
      } catch (error) {
        console.warn("[gfx] pipeline render failed", error);
        this.fallBackToDirect();
        this.renderer.render(this.scene, this.camera);
        return;
      }
      // Self-test on the 3rd frame: if nothing reached the screen, drop the pipeline.
      if (this.selfTestFrames < 3) {
        this.selfTestFrames++;
        if (this.selfTestFrames === 3) {
          const ok = centerPixelLooksDrawn(this.gl as unknown as WebGL2RenderingContext, this.screenW, this.screenH);
          if (ok === false) {
            this.fallBackToDirect();
            this.renderer.render(this.scene, this.camera);
          }
        }
      }
      return;
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  private fallBackToDirect() {
    try {
      this.pipeline?.dispose();
    } catch {
      /* ignore */
    }
    this.pipeline = null;
    pipelineBroken = true;
    this.renderer.setRenderTarget(null);
    this.cb.onGraphicsFallback?.("pipeline");
  }

  // ------------------------------------------------------------------ control
  /** Runner clothes from the wardrobe. */
  setLook(look: RunnerLook) {
    this.runner.setLook(look);
    if (this.phase !== "running") this.renderFrame();
  }

  /** Street shown in the menu and used by the next run. */
  setDistrict(id: DistrictId) {
    if (!DISTRICTS[id] || id === this.district) return;
    this.district = id;
    this.world.setDistrict(id);
    this.applyDistrictLight();
    if (this.phase === "idle") {
      this.resetRun();
      this.renderFrame();
    }
  }

  setFpsCap(fps: 30 | 60) {
    this.fpsCap = fps;
  }

  private applyDistrictLight() {
    const def = DISTRICTS[this.district];
    (this.scene.background as THREE.Color).set(def.haze);
    (this.scene.fog as THREE.Fog).color.set(def.fog);
    this.renderer.setClearColor(def.haze);
    this.hemi.color.set(def.hemi.sky);
    this.hemi.groundColor.set(def.hemi.ground);
    this.hemi.intensity = def.hemi.intensity;
    this.sun.color.set(def.sun.color);
    // Lambert lighting with ACES: the district values are tuned for the pipeline,
    // the direct path gets slightly less so it does not wash out.
    this.sun.intensity = def.sun.intensity * (this.pipeline ? 0.8 : 0.72);
    this.post.exposure = def.exposure;
    this.renderer.toneMappingExposure = def.exposure * 1.03;
  }

  start(opts: RunOptions = {}) {
    if (opts.district && opts.district !== this.district) this.setDistrict(opts.district);
    this.rng = createRng(opts.seed ?? randomSeed());
    this.resetRun();
    this.tokenAt = opts.tokenAt ?? null;
    this.phase = "running";
    this.ensureLoop();
  }

  pause() {
    if (this.phase === "running") {
      this.phase = "paused";
      this.stopLoop();
      this.renderFrame();
    }
  }

  resume() {
    if (this.phase === "paused") {
      this.phase = "running";
      this.lastTime = 0;
      this.ensureLoop();
    }
  }

  toMenu() {
    this.resetRun();
    this.phase = "idle";
    this.stopLoop();
    this.renderFrame();
    this.ensureLoop();
  }

  isRunning() {
    return this.phase === "running";
  }

  private result(): RunResult {
    return {
      score: Math.floor(this.score),
      coins: this.coins,
      distance: Math.floor(this.distance),
      durationMs: Math.round(this.elapsed * 1000),
      district: this.district,
      reason: this.crashReason,
      token: this.tokenTaken,
      stats: { ...this.stats },
    };
  }

  /** Called by the UI after a crash when the player declines / cannot revive. */
  endRun() {
    if (this.phase !== "crashed" && this.phase !== "crashing") return;
    this.phase = "over";
    this.gull.group.visible = false;
    this.cb.onGameOver(this.result());
  }

  /** Revive: clear the road ahead, stand the runner up, short invulnerability. */
  revive() {
    if (this.phase !== "crashed") return;
    const limit = this.pz - 28;
    this.obstacles = this.obstacles.filter((o) => {
      if (o.z + o.def.halfD > limit) {
        this.release(o.def.kind, o.group);
        return false;
      }
      return true;
    });
    this.py = 0;
    this.vy = 0;
    this.jumping = false;
    this.rolling = false;
    this.crashT = 0;
    this.crashReason = "crash";
    this.shake = 0;
    this.stumbleT = 0;
    this.gull.group.visible = false;
    this.invulnerable = 2.0;
    this.speed = Math.max(START_SPEED, this.speed * 0.8);
    this.phase = "running";
    this.lastTime = 0;
    this.ensureLoop();
    this.emitHud();
  }

  /** Turning shadows off is safe at runtime; turning them on needs a new GL view (see sessionShadowMode). */
  setShadows(on: boolean) {
    if (on && !this.renderer.shadowMap.enabled) return;
    const changed = this.renderer.shadowMap.enabled !== on || this.sun.castShadow !== on;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    sessionShadowMode = on;
    if (!changed) return;
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      (Array.isArray(mat) ? mat : [mat]).forEach((m) => (m.needsUpdate = true));
    });
  }

  input(action: GameInput) {
    if (this.phase !== "running") return;
    const flying = this.powerup?.kind === "wings";
    const onCarpet = this.powerup?.kind === "carpet";
    switch (action) {
      case "left":
        if (this.lane > -1) {
          this.prevLane = this.lane;
          this.lane = (this.lane - 1) as Lane;
          this.cb.onEvent("lane");
        }
        break;
      case "right":
        if (this.lane < 1) {
          this.prevLane = this.lane;
          this.lane = (this.lane + 1) as Lane;
          this.cb.onEvent("lane");
        }
        break;
      case "jump":
        if (!this.jumping && !flying && !onCarpet) {
          this.jumping = true;
          this.rolling = false;
          this.vy = JUMP_VY;
          this.stats.jumps++;
          this.cb.onEvent("jump");
        }
        break;
      case "roll":
        if (flying || onCarpet) break;
        if (this.jumping) this.vy = Math.min(this.vy, -14); // slam down
        this.rolling = true;
        this.rollT = 0;
        this.stats.rolls++;
        this.cb.onEvent("roll");
        break;
    }
  }

  dispose() {
    this.disposed = true;
    this.stopLoop();
    try {
      this.pipeline?.dispose();
      this.world.dispose();
      this.renderer.dispose();
    } catch {
      /* lost context */
    }
  }

  private ensureLoop() {
    if (this.disposed || this.raf !== 0) return;
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  private stopLoop() {
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTime = 0;
  }

  // ------------------------------------------------------------------- reset
  private resetRun() {
    for (const o of this.obstacles) this.release(o.def.kind, o.group);
    for (const p of this.pickups) this.release(p.kind, p.group);
    for (const s of this.sparkles) s.mesh.visible = false;
    this.obstacles = [];
    this.coinList = [];
    this.pickups = [];
    this.sparkles = [];
    this.runKeys = 0;
    this.nextKeyAt = this.rng.range(1200, 2200);
    this.keyPending = false;
    this.elapsed = 0;
    this.acc = 0;
    this.speed = START_SPEED;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.lane = 0;
    this.prevLane = 0;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.vy = 0;
    this.jumping = false;
    this.rolling = false;
    this.rollT = 0;
    this.crashT = 0;
    this.crashReason = "crash";
    this.invulnerable = 0;
    this.shake = 0;
    this.flash = 0;
    this.shield = false;
    this.powerup = null;
    this.stumbleT = 0;
    this.landing = 0;
    this.stats = { jumps: 0, rolls: 0, powerups: 0 };
    this.seenKinds.clear();
    this.tokenAt = null;
    this.tokenSpawned = false;
    this.tokenTaken = false;
    this.nextRowZ = FIRST_ROW_Z;
    this.runner.setShield(false);
    this.runner.group.position.set(0, 0, 0);
    this.gull.group.visible = false;
    this.world.reset();
    this.syncCoins();
    this.emitHud();
  }

  // -------------------------------------------------------------------- loop
  private loop = (time: number) => {
    if (this.disposed) return;
    this.raf = 0;
    const keepGoing = () => {
      if (this.phase === "running" || this.phase === "crashing" || this.phase === "idle") this.raf = requestAnimationFrame(this.loop);
    };
    // The menu scene stays animated at about 30 FPS to save battery.
    if (this.phase === "idle" && time - this.lastIdleFrame < 1000 / 30) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    if (this.phase !== "idle" && this.lastRender && skipFrame(time - this.lastRender, this.fpsCap)) {
      keepGoing();
      return;
    }
    if (this.phase === "idle") this.lastIdleFrame = time;
    const dtRaw = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60;
    this.lastTime = time;
    const frameMs = this.lastRender ? time - this.lastRender : 16.7;
    this.lastRender = time;
    const dt = Math.min(dtRaw, 1 / 20);

    if (this.phase === "running") {
      const p = planSteps(this.acc, dtRaw);
      this.acc = p.acc;
      for (let i = 0; i < p.steps && this.phase === "running"; i++) this.step(STEP);
      this.adapt(frameMs, dtRaw);
    } else if (this.phase === "crashing") {
      this.crashT += dt;
      if (this.crashT >= CRASH_DELAY) {
        this.phase = "crashed";
        this.cb.onCrash(this.result());
      }
    }
    this.clock += dt;
    if (this.invulnerable > 0) this.invulnerable -= dt;
    this.runner.group.visible = this.invulnerable <= 0 || Math.floor(this.clock * 12) % 2 === 0;

    this.animateCollectibles(dt);
    this.animateObstacles(dt);
    this.animateGull(dt);
    this.animateSparkles(dt);
    const laneX = this.lane * LANE_W;
    this.runner.animate(this.clock, this.speed / START_SPEED, {
      jumping: this.jumping,
      rolling: this.rolling,
      rollT: this.rollT / ROLL_TIME,
      crashed: this.phase === "crashing" || this.phase === "crashed" || this.phase === "over",
      crashT: this.crashT,
      idle: this.phase === "idle",
      flying: this.powerup?.kind === "wings" || this.landing > 0,
      carpet: this.powerup?.kind === "carpet",
      stumble: this.stumbleT,
      lean: Math.max(-1, Math.min(1, (laneX - this.px) / LANE_W)),
    });
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.world.update(this.pz);
    this.updateCamera(dt, false);
    this.syncCoins();

    this.draw();
    this.gl.endFrameEXP?.();
    keepGoing();
  };

  /** Dynamic resolution and the one-off automatic quality benchmark. */
  private adapt(frameMs: number, dtRaw: number) {
    if (this.bench) {
      if (this.elapsed > 2) this.bench.add(dtRaw);
      if (this.bench.seconds >= 8) {
        const fps = this.bench.fps;
        this.bench = null;
        this.cb.onBenchmark?.(fps);
      }
    }
    if (!this.pipeline) return;
    const next = updateScale(this.scaleState, frameMs, this.fpsCap, this.profile.minScale);
    const changed = next.scale !== this.scaleState.scale;
    this.scaleState = next;
    if (changed) {
      const size = internalSize(this.screenW, this.screenH, this.profile, next.scale);
      this.pipeline.setSize(size.w, size.h);
    }
  }

  private step(dt: number) {
    this.elapsed += dt;
    const target = Math.min(MAX_SPEED, START_SPEED * Math.pow(SPEED_STEP, Math.floor(this.elapsed / SPEED_INTERVAL)));
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), 3 * dt);
    const dz = this.speed * dt;
    this.pz -= dz;
    this.distance += dz;
    const mult = this.powerup?.kind === "x2" ? 2 : 1;
    this.score += dz * mult;

    const targetX = this.lane * LANE_W;
    this.px += (targetX - this.px) * Math.min(1, LANE_LERP * dt);

    const flying = this.powerup?.kind === "wings";
    const onCarpet = this.powerup?.kind === "carpet";
    if (flying) {
      this.py += (WINGS_HEIGHT - this.py) * Math.min(1, 3 * dt);
      this.vy = 0;
      this.jumping = false;
    } else if (onCarpet) {
      this.py += (1.05 - this.py) * Math.min(1, 6 * dt);
      this.vy = 0;
      this.jumping = false;
    } else if (this.landing > 0 || this.py > 0.001) {
      // Glide down after wings/carpet, or the normal jump arc.
      if (!this.jumping) {
        this.jumping = true;
        this.vy = Math.min(this.vy, 0);
      }
    }
    if (this.landing > 0) this.landing -= dt;
    if (this.jumping) {
      const g = this.landing > 0 ? GRAVITY * 0.35 : GRAVITY;
      this.vy += g * dt;
      this.py += this.vy * dt;
      if (this.py <= 0) {
        this.py = 0;
        this.vy = 0;
        this.jumping = false;
        this.landing = 0;
      }
    }
    if (this.rolling) {
      this.rollT += dt;
      if (this.rollT >= ROLL_TIME) this.rolling = false;
    }
    if (this.powerup) {
      this.powerup.remaining -= dt;
      if (this.powerup.remaining <= 0) {
        const ended = this.powerup.kind;
        this.powerup = null;
        if (ended === "wings" || ended === "carpet") {
          this.landing = ended === "wings" ? 1.4 : 0.4;
          this.invulnerable = Math.max(this.invulnerable, 1.2);
        }
      }
    }
    if (this.stumbleT > 0) this.stumbleT = Math.max(0, this.stumbleT - dt);

    this.runner.group.position.set(this.px, this.py, this.pz);

    this.spawnAhead();
    this.despawnBehind();
    this.collectCoins(dt);
    this.collectPickups();
    this.checkCollisions();

    this.hudAcc += dt;
    if (this.hudAcc >= HUD_INTERVAL) {
      this.hudAcc = 0;
      this.emitHud();
    }
  }

  private emitHud() {
    this.cb.onHud({
      score: Math.floor(this.score),
      coins: this.coins,
      keys: this.runKeys,
      multiplier: this.powerup?.kind === "x2" ? 2 : 1,
      distance: Math.floor(this.distance),
      speedKmh: Math.round(this.speed * 3.6),
      powerup: this.powerup ? { ...this.powerup } : null,
      shield: this.shield,
      stumble: Math.ceil(this.stumbleT),
    });
  }

  // ------------------------------------------------------------------ camera
  private updateCamera(dt: number, snap: boolean) {
    const cam = this.camera;
    let tx: number, ty: number, tz: number;
    let lx: number, ly: number, lz: number;
    if (this.phase === "idle") {
      const a = this.clock * 0.35;
      tx = Math.sin(a) * 3.2;
      ty = 2.3 + Math.sin(a * 0.7) * 0.3;
      tz = this.pz + 5.2;
      lx = 0;
      ly = 1.1;
      lz = this.pz - 4;
    } else {
      const high = this.py > 2 ? (this.py - 2) * 0.7 : 0;
      tx = this.px * 0.45;
      ty = 4.3 + this.py * 0.25 + high;
      tz = this.pz + 8.3 + high * 0.4;
      lx = this.px * 0.3;
      ly = 1.2 + high * 0.8;
      lz = this.pz - 12;
    }
    const k = snap ? 1 : Math.min(1, 9 * dt);
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z = tz;
    if (this.shake > 0) {
      cam.position.x += (Math.random() * 2 - 1) * this.shake * 0.18;
      cam.position.y += (Math.random() * 2 - 1) * this.shake * 0.18;
    }
    cam.lookAt(lx, ly, lz);
    const [sx, sy, sz] = DISTRICTS[this.district].sun.dir;
    this.sun.position.set(this.px + sx, sy, this.pz + sz);
    this.sun.target.position.set(this.px, 0, this.pz - 14);
    this.sun.target.updateMatrixWorld();
  }

  // -------------------------------------------------------------- spawning
  private difficulty() {
    return Math.min(1, this.distance / 1600);
  }

  private rowGap() {
    return 31 - this.difficulty() * 13 + this.rng.range(-2, 3);
  }

  private spawnAhead() {
    const horizon = this.pz - SPAWN_AHEAD;
    while (this.nextRowZ > horizon) {
      this.spawnRow(this.nextRowZ);
      this.nextRowZ -= this.rowGap();
    }
  }

  private despawnBehind() {
    const limit = this.pz + DESPAWN_BEHIND;
    this.obstacles = this.obstacles.filter((o) => {
      if (o.z - o.def.halfD > limit) {
        this.release(o.def.kind, o.group);
        return false;
      }
      return true;
    });
    this.coinList = this.coinList.filter((c) => c.z <= limit);
    this.pickups = this.pickups.filter((p) => {
      if (p.group.position.z > limit) {
        this.release(p.kind, p.group);
        return false;
      }
      return true;
    });
  }

  private spawnRow(z: number) {
    const row = planRow(this.rng, this.district, this.distance);
    for (const o of row.obstacles) this.place(o.kind, o.lane, z + o.dz);
    for (const c of row.coins) {
      if (c.shape === "arc") this.coinArc(c.lane, z);
      else this.coinLine(c.lane, z, c.y);
    }
    const freeLane = row.freeLane;
    if (this.distance > 120 && this.rng.chance(0.13)) {
      const kinds: PowerupKind[] = ["magnet", "x2"];
      if (!this.shield) kinds.push("shield");
      if (this.distance > 250) kinds.push("wings");
      if (this.distance > 400) kinds.push("carpet");
      this.placePickup(this.rng.pick(kinds), freeLane, z - 9, 1.1);
    }
    if (this.distance >= this.nextKeyAt) this.keyPending = true;
    if (this.keyPending) {
      this.keyPending = false;
      this.nextKeyAt = this.distance + this.rng.range(1500, 2500);
      this.placePickup("key", freeLane, z + 22, 1.2);
    }
    if (this.tokenAt !== null && !this.tokenSpawned && this.distance + SPAWN_AHEAD >= this.tokenAt) {
      this.tokenSpawned = true;
      this.placePickup("token", freeLane, z + 12, 1.3);
    }
  }

  private coinLine(lane: Lane, rowZ: number, y = 0.65) {
    for (let i = 0; i < 5; i++) this.placeCoin(lane * LANE_W, y, rowZ + 15 - i * 2.4);
  }

  private coinArc(lane: Lane, rowZ: number) {
    for (let i = 0; i < 5; i++) {
      const k = (i - 2) / 2;
      this.placeCoin(lane * LANE_W, 0.7 + 1.35 * (1 - k * k), rowZ + k * 4.2);
    }
  }

  /** Coins along the flight path while the wings are on. */
  private skyCoins(seconds: number) {
    const len = Math.min(70, seconds * this.speed);
    for (let d = 8; d < len; d += 3) this.placeCoin(this.lane * LANE_W, WINGS_HEIGHT + 0.6, this.pz - d);
  }

  private acquire(kind: string, make: () => THREE.Object3D): THREE.Object3D {
    const list = this.pool.get(kind);
    const obj = list?.pop() ?? make();
    if (!obj.parent) this.scene.add(obj);
    obj.visible = true;
    return obj;
  }

  private release(kind: string, obj: THREE.Object3D) {
    obj.visible = false;
    const list = this.pool.get(kind) ?? [];
    list.push(obj);
    this.pool.set(kind, list);
  }

  private place(kind: ObstacleKind, lane: Lane, z: number) {
    const group = this.acquire(kind, () => this.factory.makeObstacle(kind)) as THREE.Group;
    const x = lane * LANE_W;
    group.position.set(x, 0, z);
    group.rotation.set(0, 0, 0);
    this.obstacles.push({ def: OBSTACLE_DEFS[kind], group, x, z, lane, seen: false, phase: this.rng.range(0, 6) });
  }

  private placeCoin(x: number, y: number, z: number) {
    if (this.coinList.length >= MAX_COINS) return;
    this.coinList.push({ x, y, z, baseY: y, phase: Math.random() * Math.PI * 2, rot: Math.random() * 6, attracted: false });
  }

  private placePickup(kind: Pickup["kind"], lane: Lane, z: number, y: number) {
    const make = () => (kind === "key" ? this.factory.makeKey() : kind === "token" ? this.factory.makeToken() : this.factory.makePowerup(kind));
    const group = this.acquire(kind, make) as THREE.Group;
    group.position.set(lane * LANE_W, y, z);
    this.pickups.push({ kind, group, baseY: y, phase: Math.random() * 6 });
  }

  // ------------------------------------------------------------ collectibles
  private syncCoins() {
    const d = this.dummy;
    let n = 0;
    for (const c of this.coinList) {
      if (n >= MAX_COINS) break;
      d.position.set(c.x, c.y, c.z);
      d.rotation.set(Math.PI / 2, 0, c.rot);
      d.updateMatrix();
      this.coinMesh.setMatrixAt(n++, d.matrix);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  private animateCollectibles(dt: number) {
    for (const c of this.coinList) {
      c.phase += dt * 3;
      c.rot += dt * 3.2;
      if (!c.attracted) c.y = c.baseY + Math.sin(c.phase) * 0.08;
    }
    for (const p of this.pickups) {
      p.phase += dt * 2.5;
      p.group.rotation.y += dt * (p.kind === "key" ? 2.6 : 2);
      p.group.position.y = p.baseY + Math.sin(p.phase) * 0.15;
    }
  }

  private animateObstacles(dt: number) {
    for (const o of this.obstacles) {
      const dist = this.pz - o.z;
      if (!o.seen && dist < 38 && dist > 0) {
        o.seen = true;
        if (!this.seenKinds.has(o.def.kind)) {
          this.seenKinds.add(o.def.kind);
          this.cb.onObstacleSeen?.(o.def.kind);
        }
      }
      if (this.phase !== "running") continue;
      o.phase += dt;
      if (o.def.motion === "oncoming" && dist < MOVE_ACTIVATION && dist > -2) {
        o.z += (o.def.speed ?? 4) * dt;
        o.group.position.z = o.z;
      } else if (o.def.motion === "crossing") {
        // The cat paces inside its own lane, so the free lane stays free.
        o.group.position.x = o.x + Math.sin(o.phase * (o.def.speed ?? 1.4)) * 0.28;
        o.group.rotation.y = Math.cos(o.phase * (o.def.speed ?? 1.4)) > 0 ? -0.4 : 0.4;
      } else if (o.def.motion === "rising") {
        o.group.position.y = Math.sin(o.phase * 3) * 0.06;
      }
    }
  }

  private animateGull(dt: number) {
    const g = this.gull;
    const chasing = this.stumbleT > 0 && (this.phase === "running" || this.phase === "paused");
    const caught = this.crashReason === "caught" && (this.phase === "crashing" || this.phase === "crashed");
    g.group.visible = chasing || caught;
    if (!g.group.visible) return;
    const flap = Math.sin(this.clock * 16) * 0.7;
    g.wingL.rotation.z = flap;
    g.wingR.rotation.z = -flap;
    const tx = caught ? this.px : this.px - 1.1 + Math.sin(this.clock * 1.7) * 0.5;
    const ty = caught ? this.py + 1.9 : 2.6 + Math.sin(this.clock * 2.3) * 0.3;
    const tz = caught ? this.pz : this.pz + 3.2 + Math.sin(this.clock) * 0.6;
    const k = Math.min(1, 6 * dt);
    g.group.position.x += (tx - g.group.position.x) * k;
    g.group.position.y += (ty - g.group.position.y) * k;
    g.group.position.z += (tz - g.group.position.z) * k;
  }

  private burst(x: number, y: number, z: number) {
    if (this.sparklePool.length === 0) return;
    const n = this.profile.particles === "full" ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const mesh = this.sparklePool.pop();
      if (!mesh) break;
      mesh.visible = true;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(1);
      this.sparkles.push({ mesh, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3 - this.speed * 0.3, life: 0.45 });
    }
  }

  private animateSparkles(dt: number) {
    if (this.sparkles.length === 0) return;
    this.sparkles = this.sparkles.filter((s) => {
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        this.sparklePool.push(s.mesh);
        return false;
      }
      s.vy -= 9 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.y += dt * 8;
      s.mesh.scale.setScalar(Math.max(0.1, s.life / 0.45));
      return true;
    });
  }

  private collectCoins(dt: number) {
    const magnet = this.powerup?.kind === "magnet";
    const cy = this.py + 0.9;
    const ph = this.rolling ? ROLL_H : PLAYER_H;
    this.coinList = this.coinList.filter((c) => {
      const dz = c.z - this.pz;
      if (magnet && dz > -1 && dz < MAGNET_RANGE && Math.abs(c.x - this.px) < 6) {
        c.attracted = true;
        const k = Math.min(1, 14 * dt);
        c.x += (this.px - c.x) * k;
        c.y += (cy - c.y) * k;
        c.z += (this.pz - c.z) * k;
      }
      const dzNow = c.z - this.pz;
      if (Math.abs(dzNow) < 0.9 && Math.abs(c.x - this.px) < 0.95 && c.y > this.py - 0.4 && c.y < this.py + ph + 0.4) {
        this.coins++;
        this.cb.onEvent("coin");
        this.burst(c.x, c.y, c.z);
        return false;
      }
      return true;
    });
  }

  private collectPickups() {
    this.pickups = this.pickups.filter((p) => {
      const pos = p.group.position;
      if (!(Math.abs(pos.z - this.pz) < 1.0 && Math.abs(pos.x - this.px) < 1.0 && pos.y < this.py + PLAYER_H + 0.6 && pos.y > this.py - 0.6)) return true;
      if (p.kind === "key") {
        this.runKeys++;
        this.cb.onEvent("key");
      } else if (p.kind === "token") {
        this.tokenTaken = true;
        this.flash = 0.25;
        this.flashColor.set(1, 0.85, 0.4);
        this.cb.onEvent("token");
      } else {
        this.stats.powerups++;
        if (p.kind === "shield") {
          this.shield = true;
          this.runner.setShield(true);
          this.cb.onEvent("powerup");
        } else {
          const total = POWERUP_TIME[p.kind];
          this.powerup = { kind: p.kind, remaining: total, total };
          this.rolling = false;
          if (p.kind === "wings") {
            // Short grace while climbing above the obstacles.
            this.invulnerable = Math.max(this.invulnerable, 0.8);
            this.skyCoins(total);
            this.cb.onEvent("wings");
          } else if (p.kind === "carpet") this.cb.onEvent("carpet");
          else this.cb.onEvent("powerup");
        }
      }
      this.release(p.kind, p.group);
      this.emitHud();
      return false;
    });
  }

  // -------------------------------------------------------------- collisions
  private checkCollisions() {
    if (this.invulnerable > 0) return;
    const ph = this.rolling ? ROLL_H : PLAYER_H;
    const top = this.py + ph;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (Math.abs(o.z - this.pz) > o.def.halfD + PLAYER_HALF_D) continue;
      if (Math.abs(o.group.position.x - this.px) > o.def.halfW + PLAYER_HALF_W * 0.8) continue;
      if (this.py >= o.def.yMax - 0.08 || top <= o.def.yMin + 0.04) continue;

      const removeHit = () => {
        this.release(o.def.kind, o.group);
        this.obstacles.splice(i, 1);
      };
      // Uçan Halı absorbs one hit and ends.
      if (this.powerup?.kind === "carpet") {
        this.powerup = null;
        this.landing = 0.4;
        this.invulnerable = 1.5;
        this.shake = 0.6;
        this.flash = 0.3;
        this.flashColor.set(1, 1, 1);
        removeHit();
        this.cb.onEvent("shield-break");
        this.emitHud();
        return;
      }
      if (this.shield) {
        this.shield = false;
        this.runner.setShield(false);
        removeHit();
        this.shake = 0.6;
        this.flash = 0.3;
        this.flashColor.set(0.7, 0.95, 1);
        this.cb.onEvent("shield-break");
        this.emitHud();
        return;
      }
      // Clipping the side of an obstacle while changing lane: stumble back instead of
      // crashing. A second clip while the seagull is still chasing ends the run.
      const midChange = Math.abs(this.px - this.lane * LANE_W) > 0.3;
      const sideHit = midChange && o.lane === this.lane && this.prevLane !== this.lane;
      if (sideHit && this.stumbleT <= 0) {
        this.lane = this.prevLane;
        this.stumbleT = STUMBLE_TIME;
        this.invulnerable = 0.6;
        this.shake = 0.4;
        this.speed = Math.max(START_SPEED, this.speed * 0.92);
        this.cb.onEvent("stumble");
        this.emitHud();
        return;
      }
      this.crashReason = sideHit && this.stumbleT > 0 ? "caught" : "crash";
      this.phase = "crashing";
      this.crashT = 0;
      this.shake = 1;
      this.flash = 0.35;
      this.flashColor.set(1, 0.35, 0.3);
      this.stumbleT = 0;
      this.cb.onEvent("crash");
      this.emitHud();
      return;
    }
  }
}
