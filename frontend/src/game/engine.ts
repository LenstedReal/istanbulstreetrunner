import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";

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
import { OBSTACLE_DEFS, ObjectFactory, ObstacleDef, ObstacleKind, PowerupKind } from "./objects";
import { SCENE } from "./palette";
import { Runner } from "./runner";
import { CityWorld } from "./world";

export type GameInput = "left" | "right" | "jump" | "roll";
export type GameEvent = "lane" | "jump" | "roll" | "coin" | "powerup" | "shield-break" | "crash";

export interface HudState {
  score: number;
  coins: number;
  multiplier: number;
  distance: number;
  speedKmh: number;
  powerup: { kind: "magnet" | "x2"; remaining: number; total: number } | null;
  shield: boolean;
}

export interface RunResult {
  score: number;
  coins: number;
  distance: number;
}

export interface EngineCallbacks {
  onHud: (s: HudState) => void;
  onGameOver: (r: RunResult) => void;
  onEvent: (e: GameEvent) => void;
}

type Phase = "idle" | "running" | "paused" | "crashing" | "over";

interface Obstacle {
  def: ObstacleDef;
  group: THREE.Group;
  x: number;
  z: number;
}
interface Coin {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  attracted: boolean;
}
interface Powerup {
  kind: PowerupKind;
  group: THREE.Group;
  baseY: number;
  phase: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));
const shuffle = <T,>(arr: T[]) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export class RunnerEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private factory = new ObjectFactory();
  private world: CityWorld;
  private runner: Runner;

  private phase: Phase = "idle";
  private raf = 0;
  private lastTime = 0;
  private clock = 0;
  private hudAcc = 0;
  private disposed = false;

  // Run state
  private elapsed = 0;
  private speed = START_SPEED;
  private distance = 0;
  private score = 0;
  private coins = 0;
  private lane = 0;
  private px = 0;
  private py = 0;
  private pz = 0;
  private vy = 0;
  private jumping = false;
  private rolling = false;
  private rollT = 0;
  private crashT = 0;
  private shake = 0;
  private shield = false;
  private powerup: { kind: "magnet" | "x2"; remaining: number; total: number } | null = null;
  private nextRowZ = FIRST_ROW_Z;

  private obstacles: Obstacle[] = [];
  private coinList: Coin[] = [];
  private powerups: Powerup[] = [];
  private pool = new Map<string, THREE.Object3D[]>();

  constructor(
    private gl: ExpoWebGLRenderingContext,
    private cb: EngineCallbacks,
  ) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
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
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as unknown as WebGL2RenderingContext,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(SCENE.haze);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(SCENE.haze);
    this.scene.fog = new THREE.Fog(SCENE.fog, 45, 160);

    this.camera = new THREE.PerspectiveCamera(80, w / h, 0.1, 600);

    this.scene.add(new THREE.HemisphereLight(SCENE.hemiSky, SCENE.hemiGround, 0.9));
    this.sun = new THREE.DirectionalLight(SCENE.sun, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
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

    this.world = new CityWorld(this.scene, this.factory);
    this.runner = new Runner(this.factory);
    this.scene.add(this.runner.group);

    this.resetRun();
    this.updateCamera(1, true);
    this.loop(0);
  }

  // ------------------------------------------------------------------ control
  start() {
    this.resetRun();
    this.phase = "running";
  }

  pause() {
    if (this.phase === "running") this.phase = "paused";
  }

  resume() {
    if (this.phase === "paused") this.phase = "running";
  }

  toMenu() {
    this.resetRun();
    this.phase = "idle";
  }

  isRunning() {
    return this.phase === "running";
  }

  /** Shadows are the most expensive effect; low-end devices can switch them off. */
  setShadows(on: boolean) {
    if (this.renderer.shadowMap.enabled === on) return;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      (Array.isArray(mat) ? mat : [mat]).forEach((m) => (m.needsUpdate = true));
    });
  }

  input(action: GameInput) {
    if (this.phase !== "running") return;
    switch (action) {
      case "left":
        if (this.lane > -1) {
          this.lane--;
          this.cb.onEvent("lane");
        }
        break;
      case "right":
        if (this.lane < 1) {
          this.lane++;
          this.cb.onEvent("lane");
        }
        break;
      case "jump":
        if (!this.jumping) {
          this.jumping = true;
          this.rolling = false;
          this.vy = JUMP_VY;
          this.cb.onEvent("jump");
        }
        break;
      case "roll":
        if (this.jumping) {
          this.vy = Math.min(this.vy, -14); // slam down
        }
        this.rolling = true;
        this.rollT = 0;
        this.cb.onEvent("roll");
        break;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------- reset
  private resetRun() {
    for (const o of this.obstacles) this.release(o.def.kind, o.group);
    for (const c of this.coinList) this.release("coin", c.mesh);
    for (const p of this.powerups) this.release(p.kind, p.group);
    this.obstacles = [];
    this.coinList = [];
    this.powerups = [];
    this.elapsed = 0;
    this.speed = START_SPEED;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.lane = 0;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.vy = 0;
    this.jumping = false;
    this.rolling = false;
    this.rollT = 0;
    this.crashT = 0;
    this.shake = 0;
    this.shield = false;
    this.powerup = null;
    this.nextRowZ = FIRST_ROW_Z;
    this.runner.setShield(false);
    this.runner.group.position.set(0, 0, 0);
    this.world.reset();
    this.emitHud();
  }

  // -------------------------------------------------------------------- loop
  private loop = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dtRaw = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60;
    this.lastTime = time;
    const dt = Math.min(dtRaw, 1 / 30);
    this.clock += dt;

    if (this.phase === "running") this.step(dt);
    else if (this.phase === "crashing") {
      this.crashT += dt;
      if (this.crashT >= CRASH_DELAY) {
        this.phase = "over";
        this.cb.onGameOver({ score: Math.floor(this.score), coins: this.coins, distance: Math.floor(this.distance) });
      }
    }

    this.animateCollectibles(dt);
    this.runner.animate(this.clock, this.speed / START_SPEED, {
      jumping: this.jumping,
      rolling: this.rolling,
      rollT: this.rollT / ROLL_TIME,
      crashed: this.phase === "crashing" || this.phase === "over",
      crashT: this.crashT,
      idle: this.phase === "idle",
    });
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.world.update(this.pz);
    this.updateCamera(dt, false);

    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP?.();
  };

  private step(dt: number) {
    this.elapsed += dt;
    const target = Math.min(MAX_SPEED, START_SPEED * Math.pow(SPEED_STEP, Math.floor(this.elapsed / SPEED_INTERVAL)));
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), 3 * dt);
    const dz = this.speed * dt;
    this.pz -= dz;
    this.distance += dz;
    const mult = this.powerup?.kind === "x2" ? 2 : 1;
    this.score += dz * mult;

    // Lane
    const targetX = this.lane * LANE_W;
    this.px += (targetX - this.px) * Math.min(1, LANE_LERP * dt);
    // Jump
    if (this.jumping) {
      this.vy += GRAVITY * dt;
      this.py += this.vy * dt;
      if (this.py <= 0) {
        this.py = 0;
        this.vy = 0;
        this.jumping = false;
      }
    }
    // Roll
    if (this.rolling) {
      this.rollT += dt;
      if (this.rollT >= ROLL_TIME) this.rolling = false;
    }
    // Powerup timer
    if (this.powerup) {
      this.powerup.remaining -= dt;
      if (this.powerup.remaining <= 0) this.powerup = null;
    }

    this.runner.group.position.set(this.px, this.py, this.pz);

    this.spawnAhead();
    this.despawnBehind();
    this.collectCoins(dt);
    this.collectPowerups();
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
      multiplier: this.powerup?.kind === "x2" ? 2 : 1,
      distance: Math.floor(this.distance),
      speedKmh: Math.round(this.speed * 3.6),
      powerup: this.powerup ? { ...this.powerup } : null,
      shield: this.shield,
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
      tx = this.px * 0.45;
      ty = 4.3 + this.py * 0.25;
      tz = this.pz + 8.3;
      lx = this.px * 0.3;
      ly = 1.2;
      lz = this.pz - 12;
    }
    const k = snap ? 1 : Math.min(1, 9 * dt);
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z = tz;
    if (this.shake > 0) {
      cam.position.x += rand(-1, 1) * this.shake * 0.18;
      cam.position.y += rand(-1, 1) * this.shake * 0.18;
    }
    cam.lookAt(lx, ly, lz);
    // Low golden-hour sun from the right so buildings throw long shadows across the street.
    this.sun.position.set(this.px + 26, 30, this.pz - 6);
    this.sun.target.position.set(this.px, 0, this.pz - 14);
    this.sun.target.updateMatrixWorld();
  }

  // -------------------------------------------------------------- spawning
  private difficulty() {
    return Math.min(1, this.distance / 1600);
  }

  private rowGap() {
    return 31 - this.difficulty() * 13 + rand(-2, 3);
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
    this.coinList = this.coinList.filter((c) => {
      if (c.mesh.position.z > limit) {
        this.release("coin", c.mesh);
        return false;
      }
      return true;
    });
    this.powerups = this.powerups.filter((p) => {
      if (p.group.position.z > limit) {
        this.release(p.kind, p.group);
        return false;
      }
      return true;
    });
  }

  private spawnRow(z: number) {
    const lanes = shuffle([-1, 0, 1]);
    const late = this.distance > 350;
    const hard = this.distance > 900;
    const roll = Math.random();
    let freeLane = lanes[2];
    if (roll < 0.3) {
      // Low obstacles: jump. One lane early, up to all three later.
      const count = late ? randi(1, hard ? 3 : 2) : 1;
      for (let i = 0; i < count; i++) this.place(Math.random() < 0.5 ? "cart" : "barrier", lanes[i], z);
      if (Math.random() < 0.5) this.coinArc(lanes[0], z);
      if (count < 3) this.coinLine(lanes[count], z);
      freeLane = lanes[Math.min(count, 2)];
    } else if (roll < 0.52) {
      // Pillars: change lane. Never all three.
      const count = Math.random() < 0.6 ? 1 : 2;
      for (let i = 0; i < count; i++) this.place("pillar", lanes[i], z);
      if (late && count === 1 && Math.random() < 0.5) {
        this.place("barrier", lanes[1], z);
        this.coinLine(lanes[2], z);
        freeLane = lanes[2];
      } else {
        this.coinLine(lanes[count], z);
        freeLane = lanes[count];
      }
    } else if (roll < 0.76) {
      // Trams block whole lanes.
      const count = hard && Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) this.place("tram", lanes[i], z - 2);
      if (count === 1 && late && Math.random() < 0.4) this.place("sign", lanes[1], z);
      this.coinLine(lanes[count], z);
      freeLane = lanes[count];
    } else {
      // Overhead signs: roll under.
      const count = late ? randi(1, 2) : 1;
      for (let i = 0; i < count; i++) this.place("sign", lanes[i], z);
      this.coinLine(lanes[0], z, 0.45);
      freeLane = lanes[0];
    }
    if (this.distance > 120 && Math.random() < 0.13) {
      const kinds: PowerupKind[] = this.shield ? ["magnet", "x2"] : ["magnet", "x2", "shield"];
      this.placePowerup(kinds[randi(0, kinds.length - 1)], freeLane, z - 9);
    }
  }

  private coinLine(lane: number, rowZ: number, y = 0.65) {
    for (let i = 0; i < 5; i++) this.placeCoin(lane * LANE_W, y, rowZ + 15 - i * 2.4);
  }

  private coinArc(lane: number, rowZ: number) {
    for (let i = 0; i < 5; i++) {
      const k = (i - 2) / 2;
      this.placeCoin(lane * LANE_W, 0.7 + 1.35 * (1 - k * k), rowZ + k * 4.2);
    }
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

  private place(kind: ObstacleKind, lane: number, z: number) {
    const group = this.acquire(kind, () => this.factory.makeObstacle(kind)) as THREE.Group;
    const x = lane * LANE_W;
    group.position.set(x, 0, z);
    this.obstacles.push({ def: OBSTACLE_DEFS[kind], group, x, z });
  }

  private placeCoin(x: number, y: number, z: number) {
    const mesh = this.acquire("coin", () => this.factory.makeCoin()) as THREE.Mesh;
    mesh.position.set(x, y, z);
    this.coinList.push({ mesh, baseY: y, phase: Math.random() * Math.PI * 2, attracted: false });
  }

  private placePowerup(kind: PowerupKind, lane: number, z: number) {
    const group = this.acquire(kind, () => this.factory.makePowerup(kind)) as THREE.Group;
    group.position.set(lane * LANE_W, 1.1, z);
    this.powerups.push({ kind, group, baseY: 1.1, phase: Math.random() * 6 });
  }

  // ------------------------------------------------------------ collectibles
  private animateCollectibles(dt: number) {
    for (const c of this.coinList) {
      c.phase += dt * 3;
      c.mesh.rotation.z += dt * 3.2;
      if (!c.attracted) c.mesh.position.y = c.baseY + Math.sin(c.phase) * 0.08;
    }
    for (const p of this.powerups) {
      p.phase += dt * 2.5;
      p.group.rotation.y += dt * 2;
      p.group.position.y = p.baseY + Math.sin(p.phase) * 0.15;
    }
  }

  private collectCoins(dt: number) {
    const magnet = this.powerup?.kind === "magnet";
    const cy = this.py + 0.9;
    this.coinList = this.coinList.filter((c) => {
      const p = c.mesh.position;
      const dz = p.z - this.pz;
      if (magnet && dz > -1 && dz < MAGNET_RANGE && Math.abs(p.x - this.px) < 6) {
        c.attracted = true;
        const k = Math.min(1, 14 * dt);
        p.x += (this.px - p.x) * k;
        p.y += (cy - p.y) * k;
        p.z += (this.pz - p.z) * k;
      }
      const ph = this.rolling ? ROLL_H : PLAYER_H;
      if (Math.abs(dz) < 0.9 && Math.abs(p.x - this.px) < 0.95 && p.y > this.py - 0.4 && p.y < this.py + ph + 0.4) {
        this.coins++;
        this.cb.onEvent("coin");
        this.release("coin", c.mesh);
        return false;
      }
      return true;
    });
  }

  private collectPowerups() {
    this.powerups = this.powerups.filter((p) => {
      const pos = p.group.position;
      if (Math.abs(pos.z - this.pz) < 1.0 && Math.abs(pos.x - this.px) < 1.0 && pos.y < this.py + PLAYER_H + 0.5 && pos.y > this.py - 0.5) {
        if (p.kind === "shield") {
          this.shield = true;
          this.runner.setShield(true);
        } else {
          this.powerup = { kind: p.kind, remaining: POWERUP_TIME[p.kind], total: POWERUP_TIME[p.kind] };
        }
        this.cb.onEvent("powerup");
        this.release(p.kind, p.group);
        return false;
      }
      return true;
    });
  }

  // -------------------------------------------------------------- collisions
  private checkCollisions() {
    const ph = this.rolling ? ROLL_H : PLAYER_H;
    const top = this.py + ph;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (Math.abs(o.z - this.pz) > o.def.halfD + PLAYER_HALF_D) continue;
      if (Math.abs(o.x - this.px) > o.def.halfW + PLAYER_HALF_W * 0.8) continue;
      if (this.py >= o.def.yMax - 0.08 || top <= o.def.yMin + 0.04) continue;
      if (this.shield) {
        this.shield = false;
        this.runner.setShield(false);
        this.release(o.def.kind, o.group);
        this.obstacles.splice(i, 1);
        this.shake = 0.6;
        this.cb.onEvent("shield-break");
        this.emitHud();
        return;
      }
      this.phase = "crashing";
      this.crashT = 0;
      this.shake = 1;
      this.cb.onEvent("crash");
      this.emitHud();
      return;
    }
  }
}
