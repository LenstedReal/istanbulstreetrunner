import * as THREE from "three";

import { OBSTACLES, type ObstacleKind, type ObstacleSpec } from "./districts";
import { cloneShared, mergedGroup } from "./merge";
import { SCENE } from "./palette";

export type { ObstacleKind };
export type PowerupKind = "magnet" | "x2" | "shield" | "wings" | "carpet";
export type ObstacleDef = ObstacleSpec;

// Collision boxes live in districts.ts (OBSTACLES); the original five keep their 1.0 values.
export const OBSTACLE_DEFS: Record<ObstacleKind, ObstacleDef> = OBSTACLES;

const lambert = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

export class ObjectFactory {
  readonly box = new THREE.BoxGeometry(1, 1, 1);
  readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  readonly cylLow = new THREE.CylinderGeometry(1, 1, 1, 8);
  readonly sphere = new THREE.SphereGeometry(1, 12, 10);
  readonly sphereLow = new THREE.SphereGeometry(1, 8, 6);
  readonly cone = new THREE.ConeGeometry(1, 1, 10);
  readonly coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.14, 24);
  readonly coinRimGeo = new THREE.TorusGeometry(0.38, 0.055, 8, 28).rotateX(Math.PI / 2);
  readonly keyRingGeo = new THREE.TorusGeometry(0.2, 0.06, 8, 20);
  readonly torus = new THREE.TorusGeometry(0.16, 0.06, 6, 12);
  readonly octa = new THREE.OctahedronGeometry(0.42, 0);
  readonly ico = new THREE.IcosahedronGeometry(0.42, 0);

  readonly mats = {
    tramRed: lambert(SCENE.tramRed),
    tramCream: lambert(SCENE.tramCream),
    tramDark: lambert(SCENE.tramDark),
    tramGlass: lambert(SCENE.tramGlass, { emissive: 0x1b3a55, emissiveIntensity: 0.4 }),
    headlight: lambert(SCENE.headlight, { emissive: SCENE.headlight, emissiveIntensity: 0.8 }),
    wood: lambert(SCENE.wood),
    woodLight: lambert(SCENE.woodLight),
    simit: lambert(SCENE.simit),
    white: lambert(SCENE.white),
    red: lambert(SCENE.red),
    yellow: lambert(SCENE.yellow),
    black: lambert(SCENE.black),
    metal: lambert(SCENE.metal),
    stone: lambert(SCENE.stone),
    stoneDark: lambert(SCENE.stoneDark),
    lampGlow: lambert(SCENE.lampGlow, { emissive: SCENE.lampGlow, emissiveIntensity: 0.9 }),
    dome: lambert(SCENE.dome),
    key: lambert(0xffc233, { emissive: 0x9a6a00, emissiveIntensity: 0.8 }),
    magnet: lambert(SCENE.magnet),
    magnetTip: lambert(SCENE.magnetTip),
    shield: new THREE.MeshLambertMaterial({ color: SCENE.shield, transparent: true, opacity: 0.75, emissive: 0x005566 }),
    doubler: lambert(SCENE.doubler, { emissive: 0x6a4a00, emissiveIntensity: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }),
    // Extra colours for the 2.0 obstacles (plain Lambert, baked into vertex colours).
    blue: lambert(0x1e5fa8),
    teal: lambert(0x2a7f62),
    orange: lambert(0xe07a2e),
    pink: lambert(0xe85d8a),
    purple: lambert(0x7b4fa3),
    grey: lambert(0x8d9196),
    greyLight: lambert(0xc9ccd0),
    silver: lambert(0xc8d2da),
    ice: lambert(0xdff3fb),
    green: lambert(0x3f8a3d),
    greenDark: lambert(0x2e5f2a),
    potato: lambert(0xc99a5b),
    cloth: lambert(0x8a5a3a),
    busBody: lambert(0x2a6fb5),
    busGlass: lambert(0x23384d, { emissive: 0x10202f, emissiveIntensity: 0.5 }),
    skin: lambert(0xe2a878),
    carpet: lambert(0xb5262e),
    carpetGold: lambert(0xe2b04a),
    feather: lambert(0xf4f4f0),
    beak: lambert(0xf2a12b),
    token: lambert(0x2f78c4, { emissive: 0x0f3e70, emissiveIntensity: 0.6 }),
    tokenGold: lambert(0xffcf4a, { emissive: 0x8a5a00, emissiveIntensity: 0.7 }),
  };

  /** Vertex-coloured materials shared by every baked object. */
  private bakedMats = new Map<string, THREE.Material>();
  private protos = new Map<string, THREE.Group>();

  /** Box with its bottom face at `yBottom`. */
  part(mat: THREE.Material, w: number, h: number, d: number, x = 0, yBottom = 0, z = 0, geo: THREE.BufferGeometry = this.box) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, yBottom + h / 2, z);
    return m;
  }

  /** Mesh with explicit centre, scale and rotation. */
  private at(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    return m;
  }

  private cached(key: string, build: () => THREE.Group, cast = true, receive = true): THREE.Group {
    let proto = this.protos.get(key);
    if (!proto) {
      proto = mergedGroup(build(), this.bakedMats, { cast, receive });
      this.protos.set(key, proto);
    }
    return cloneShared(proto);
  }

  makeObstacle(kind: ObstacleKind): THREE.Group {
    return this.cached(`ob:${kind}`, () => this.buildObstacle(kind));
  }

  private buildObstacle(kind: ObstacleKind): THREE.Group {
    switch (kind) {
      case "tram":
        return this.makeTram();
      case "cart":
        return this.makeCart();
      case "barrier":
        return this.makeBarrier();
      case "sign":
        return this.makeSign();
      case "pillar":
        return this.makePillar();
      case "icecream":
        return this.makeIcecream();
      case "cat":
        return this.makeCat();
      case "fishcrates":
        return this.makeFishCrates();
      case "flowercart":
        return this.makeFlowerCart();
      case "pigeons":
        return this.makePigeons();
      case "porter":
        return this.makePorter();
      case "tray":
        return this.makeTray();
      case "lines":
        return this.makeLines();
      case "buckets":
        return this.makeBuckets();
      case "bus":
        return this.makeBus();
      case "kumpir":
        return this.makeKumpir();
      case "scooter":
        return this.makeScooter();
      case "bench":
        return this.makeBench();
    }
  }

  // ------------------------------------------------------------- 1.0 obstacles
  /** Nostalgic red tram, occupies one lane. Player approaches its +z face. */
  private makeTram() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.tramDark, 1.7, 0.55, 6.8, 0, 0.05));
    g.add(this.part(m.tramRed, 1.9, 1.8, 7.0, 0, 0.6));
    g.add(this.part(m.tramCream, 1.95, 0.3, 7.2, 0, 2.4));
    g.add(this.part(m.tramDark, 1.2, 0.12, 5.0, 0, 2.7));
    g.add(this.part(m.tramDark, 0.08, 0.9, 0.08, 0, 2.8));
    g.add(this.part(m.tramDark, 0.08, 0.08, 2.0, 0, 3.7));
    g.add(this.part(m.tramCream, 1.96, 0.18, 7.05, 0, 1.15));
    for (let i = 0; i < 5; i++) g.add(this.part(m.tramGlass, 1.96, 0.75, 0.85, 0, 1.45, -2.6 + i * 1.3));
    g.add(this.part(m.tramGlass, 1.4, 0.75, 0.12, 0, 1.45, 3.5));
    g.add(this.part(m.tramGlass, 1.4, 0.75, 0.12, 0, 1.45, -3.5));
    g.add(this.part(m.headlight, 0.3, 0.25, 0.08, -0.6, 0.95, 3.52));
    g.add(this.part(m.headlight, 0.3, 0.25, 0.08, 0.6, 0.95, 3.52));
    g.add(this.part(m.tramCream, 1.0, 0.3, 0.08, 0, 2.05, 3.52));
    g.add(this.part(m.black, 0.45, 0.22, 0.09, 0, 0.62, 3.52));
    for (const z of [-1.95, 1.95]) g.add(this.part(m.tramDark, 1.97, 1.0, 0.05, 0, 0.75, z));
    for (const z of [-2.3, 2.3]) {
      g.add(this.part(m.black, 1.5, 0.35, 1.6, 0, 0.0, z));
      for (const x of [-0.75, 0.75]) g.add(this.at(this.cyl, m.metal, x, 0.3, z, 0.3, 0.12, 0.3, 0, 0, Math.PI / 2));
    }
    g.add(this.part(m.tramCream, 0.35, 0.12, 0.6, -0.78, 1.0, 3.3));
    return g;
  }

  /** Simit cart with wheels: low, jump over it. */
  private makeCart() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.wood, 1.35, 0.55, 1.0, 0, 0.3));
    g.add(this.part(m.white, 1.37, 0.2, 1.02, 0, 0.45));
    g.add(this.part(m.red, 1.38, 0.07, 1.03, 0, 0.52));
    g.add(this.part(m.woodLight, 1.45, 0.08, 1.1, 0, 0.85));
    for (const x of [-0.78, 0.78]) g.add(this.at(this.cyl, m.black, x, 0.3, 0, 0.3, 0.1, 0.3, 0, 0, Math.PI / 2));
    g.add(this.part(m.metal, 0.05, 0.05, 0.9, -0.45, 0.9, 0));
    g.add(this.part(m.metal, 0.05, 0.05, 0.9, 0.45, 0.9, 0));
    for (let i = 0; i < 6; i++) {
      g.add(this.at(this.torus, m.simit, -0.4 + (i % 3) * 0.4, 0.97 + Math.floor(i / 3) * 0.1, i < 3 ? -0.22 : 0.22, 1, 1, 1, Math.PI / 2));
    }
    return g;
  }

  /** Red & white road barrier: jump over. */
  private makeBarrier() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.metal, 0.1, 0.95, 0.5, -0.8, 0));
    g.add(this.part(m.metal, 0.1, 0.95, 0.5, 0.8, 0));
    g.add(this.part(m.white, 1.8, 0.24, 0.08, 0, 0.66));
    for (let i = 0; i < 4; i++) g.add(this.part(m.red, 0.22, 0.24, 0.09, -0.68 + i * 0.45, 0.66));
    g.add(this.part(m.red, 1.8, 0.14, 0.08, 0, 0.28));
    return g;
  }

  /** Overhead "road works" sign: roll under. */
  private makeSign() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-0.9, 0.9]) g.add(this.at(this.cyl, m.metal, x, 1.175, 0, 0.06, 2.35, 0.06));
    g.add(this.part(m.yellow, 1.9, 0.8, 0.08, 0, 1.3));
    for (let i = 0; i < 3; i++) g.add(this.part(m.black, 0.14, 0.82, 0.09, -0.6 + i * 0.6, 1.29));
    g.add(this.part(m.black, 1.9, 0.06, 0.09, 0, 1.3));
    g.add(this.part(m.black, 1.9, 0.06, 0.09, 0, 2.04));
    return g;
  }

  /** Ottoman style street lamp column: full block, change lane. */
  private makePillar() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.stoneDark, 1.0, 0.3, 1.0, 0, 0));
    g.add(this.at(this.cyl, m.stone, 0, 1.5, 0, 0.38, 2.4, 0.38));
    g.add(this.part(m.stoneDark, 0.9, 0.22, 0.9, 0, 2.7));
    g.add(this.part(m.lampGlow, 0.5, 0.55, 0.5, 0, 2.92));
    g.add(this.at(new THREE.ConeGeometry(0.5, 0.45, 4), m.dome, 0, 3.7, 0, 1, 1, 1, 0, Math.PI / 4));
    return g;
  }

  // ------------------------------------------------------------- 2.0 obstacles
  /** Ice-cream stand with striped canopy: change lane. */
  private makeIcecream() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.white, 1.5, 0.95, 1.0, 0, 0.1));
    g.add(this.part(m.red, 1.52, 0.18, 1.02, 0, 0.75));
    g.add(this.part(m.woodLight, 1.6, 0.08, 1.1, 0, 1.05));
    for (const x of [-0.7, 0.7]) g.add(this.at(this.cyl, m.metal, x, 1.65, 0, 0.04, 1.2, 0.04));
    for (let i = 0; i < 6; i++) g.add(this.part(i % 2 ? m.white : m.red, 0.28, 0.12, 1.3, -0.7 + i * 0.28, 2.25));
    g.add(this.part(m.red, 1.7, 0.2, 0.05, 0, 2.05, 0.64));
    for (let i = 0; i < 3; i++) {
      g.add(this.at(this.cone, m.woodLight, -0.4 + i * 0.4, 1.3, 0, 0.09, 0.25, 0.09, Math.PI));
      g.add(this.at(this.sphereLow, i === 1 ? m.pink : m.white, -0.4 + i * 0.4, 1.48, 0, 0.12, 0.12, 0.12));
    }
    for (const x of [-0.6, 0.6]) g.add(this.at(this.cyl, m.black, x, 0.12, 0.45, 0.12, 0.08, 0.12, 0, 0, Math.PI / 2));
    return g;
  }

  /** Street cat: jump over. */
  private makeCat() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.at(this.sphereLow, m.orange, 0, 0.3, 0, 0.18, 0.17, 0.32));
    g.add(this.at(this.sphereLow, m.orange, 0, 0.45, 0.3, 0.14, 0.13, 0.13));
    for (const x of [-0.07, 0.07]) g.add(this.at(this.cone, m.orange, x, 0.58, 0.3, 0.04, 0.08, 0.04));
    for (const x of [-0.05, 0.05]) g.add(this.at(this.sphereLow, m.black, x, 0.47, 0.42, 0.02, 0.02, 0.02));
    g.add(this.at(this.cyl, m.orange, 0, 0.42, -0.4, 0.035, 0.38, 0.035, 0.7));
    for (const [x, z] of [[-0.09, 0.18], [0.09, 0.18], [-0.09, -0.18], [0.09, -0.18]] as const) g.add(this.at(this.cyl, m.white, x, 0.08, z, 0.04, 0.16, 0.04));
    return g;
  }

  /** Stack of fish crates on ice: jump over. */
  private makeFishCrates() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-0.42, 0.42]) {
      g.add(this.part(m.blue, 0.8, 0.45, 0.8, x, 0));
      g.add(this.part(m.ice, 0.72, 0.08, 0.72, x, 0.45));
      for (let i = 0; i < 3; i++) g.add(this.at(this.sphereLow, m.silver, x - 0.2 + i * 0.2, 0.58, 0, 0.07, 0.05, 0.25, 0, 0.3 * (i - 1)));
    }
    g.add(this.part(m.blue, 0.8, 0.22, 0.8, 0, 0.45, -0.1));
    return g;
  }

  /** Flower cart with umbrella: change lane. */
  private makeFlowerCart() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.wood, 1.5, 0.6, 1.2, 0, 0.3));
    for (const x of [-0.8, 0.8]) g.add(this.at(this.cyl, m.black, x, 0.3, 0, 0.3, 0.08, 0.3, 0, 0, Math.PI / 2));
    const colors = [m.red, m.yellow, m.pink, m.purple, m.white];
    for (let i = 0; i < 10; i++) {
      g.add(this.at(this.sphereLow, colors[i % colors.length], -0.6 + (i % 5) * 0.3, 1.0 + Math.floor(i / 5) * 0.18, -0.25 + Math.floor(i / 5) * 0.4, 0.14, 0.14, 0.14));
    }
    for (let i = 0; i < 6; i++) g.add(this.at(this.cyl, m.green, -0.6 + (i % 3) * 0.6, 0.98, (i < 3 ? -0.3 : 0.3), 0.02, 0.25, 0.02));
    g.add(this.at(this.cyl, m.metal, 0, 1.4, 0, 0.03, 1.0, 0.03));
    g.add(this.at(this.cone, m.teal, 0, 1.95, 0, 0.95, 0.35, 0.95));
    return g;
  }

  /** Pigeons taking off above the lane: roll under. */
  private makePigeons() {
    const g = new THREE.Group();
    const m = this.mats;
    const spots: [number, number, number][] = [[-0.6, 1.55, 0.1], [0.1, 1.85, -0.2], [0.65, 1.5, 0.2], [-0.2, 2.15, 0.25], [0.45, 2.1, -0.1]];
    for (const [x, y, z] of spots) {
      g.add(this.at(this.sphereLow, m.grey, x, y, z, 0.13, 0.11, 0.2));
      g.add(this.at(this.sphereLow, m.greyLight, x, y + 0.08, z + 0.15, 0.07, 0.07, 0.07));
      g.add(this.part(m.greyLight, 0.55, 0.02, 0.16, x, y + 0.02, z));
    }
    // A thin cable on two poles so the obstacle reads as "something overhead" from a distance.
    for (const x of [-0.95, 0.95]) g.add(this.at(this.cyl, m.metal, x, 1.2, 0, 0.04, 2.4, 0.04));
    g.add(this.part(m.black, 1.9, 0.03, 0.03, 0, 1.3));
    return g;
  }

  /** Porter carrying a tall load: change lane. */
  private makePorter() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-0.12, 0.12]) g.add(this.part(m.tramDark, 0.16, 0.8, 0.18, x, 0));
    g.add(this.part(m.cloth, 0.5, 0.65, 0.32, 0, 0.8));
    g.add(this.at(this.sphere, m.skin, 0, 1.6, 0.1, 0.17, 0.17, 0.17));
    g.add(this.part(m.wood, 0.7, 0.12, 0.5, 0, 1.0, -0.3));
    g.add(this.part(m.woodLight, 0.85, 0.5, 0.65, 0, 1.12, -0.35));
    g.add(this.part(m.cloth, 0.8, 0.45, 0.6, 0, 1.62, -0.35));
    g.add(this.part(m.white, 0.75, 0.38, 0.55, 0, 2.07, -0.35));
    return g;
  }

  /** Street vendor's folding tray: jump over. */
  private makeTray() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-0.6, 0.6]) {
      g.add(this.at(this.box, m.metal, x, 0.32, 0.15, 0.04, 0.75, 0.04, 0.5));
      g.add(this.at(this.box, m.metal, x, 0.32, -0.15, 0.04, 0.75, 0.04, -0.5));
    }
    g.add(this.part(m.woodLight, 1.45, 0.06, 0.8, 0, 0.62));
    const goods = [m.red, m.blue, m.yellow, m.green, m.white, m.orange];
    for (let i = 0; i < 6; i++) g.add(this.part(goods[i], 0.32, 0.1, 0.22, -0.5 + (i % 3) * 0.5, 0.68, i < 3 ? -0.18 : 0.18));
    return g;
  }

  /** Fishing lines across the lane on the bridge: roll under. */
  private makeLines() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-1.0, 1.0]) g.add(this.at(this.cyl, m.woodLight, x, 1.4, 0, 0.035, 2.8, 0.035, 0, 0, x * 0.08));
    for (let i = 0; i < 4; i++) g.add(this.part(m.greyLight, 2.0, 0.015, 0.015, 0, 1.3 + i * 0.12));
    for (const x of [-0.5, 0.1, 0.6]) {
      g.add(this.part(m.greyLight, 0.01, 0.35, 0.01, x, 1.0));
      g.add(this.at(this.sphereLow, m.silver, x, 0.98, 0, 0.04, 0.12, 0.03));
    }
    return g;
  }

  /** Bait buckets: jump over. */
  private makeBuckets() {
    const g = new THREE.Group();
    const m = this.mats;
    const spots: [number, number, THREE.Material][] = [[-0.45, 0.1, m.blue], [0.05, -0.15, m.yellow], [0.5, 0.12, m.red]];
    for (const [x, z, mat] of spots) {
      g.add(this.at(this.cylLow, mat, x, 0.3, z, 0.22, 0.6, 0.22));
      g.add(this.at(this.cylLow, m.greenDark, x, 0.58, z, 0.2, 0.04, 0.2));
    }
    return g;
  }

  /** City bus: blocks a lane, longer than the tram. */
  private makeBus() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.tramDark, 1.8, 0.35, 9.0, 0, 0.15));
    g.add(this.part(m.busBody, 2.0, 1.25, 9.2, 0, 0.45));
    g.add(this.part(m.white, 2.02, 1.0, 9.22, 0, 1.7));
    g.add(this.part(m.busBody, 2.0, 0.25, 9.2, 0, 2.7));
    for (let i = 0; i < 6; i++) g.add(this.part(m.busGlass, 2.04, 0.7, 1.15, 0, 1.85, -3.6 + i * 1.45));
    g.add(this.part(m.busGlass, 1.7, 1.0, 0.08, 0, 1.6, 4.6));
    g.add(this.part(m.headlight, 0.32, 0.18, 0.06, -0.7, 0.75, 4.62));
    g.add(this.part(m.headlight, 0.32, 0.18, 0.06, 0.7, 0.75, 4.62));
    g.add(this.part(m.yellow, 1.0, 0.22, 0.06, 0, 2.62, 4.62));
    for (const z of [-3.2, 3.2]) for (const x of [-0.92, 0.92]) g.add(this.at(this.cyl, m.black, x, 0.42, z, 0.42, 0.22, 0.42, 0, 0, Math.PI / 2));
    return g;
  }

  /** Kumpir stand with glass display: change lane. */
  private makeKumpir() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.white, 1.6, 1.0, 1.1, 0, 0));
    g.add(this.part(m.orange, 1.62, 0.15, 1.12, 0, 0.82));
    g.add(this.part(m.woodLight, 1.7, 0.08, 1.2, 0, 1.0));
    for (let i = 0; i < 4; i++) g.add(this.at(this.sphereLow, m.potato, -0.55 + i * 0.37, 1.22, 0.05, 0.16, 0.12, 0.22));
    g.add(this.part(m.ice, 1.5, 0.5, 0.04, 0, 1.08, 0.5));
    for (const x of [-0.75, 0.75]) g.add(this.at(this.cyl, m.metal, x, 1.7, 0, 0.04, 1.4, 0.04));
    g.add(this.part(m.orange, 1.8, 0.35, 1.3, 0, 2.3));
    g.add(this.part(m.white, 1.6, 0.14, 0.05, 0, 2.38, 0.66));
    return g;
  }

  /** E-scooter coming the other way: jump over. */
  private makeScooter() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.tramDark, 0.2, 0.08, 1.0, 0, 0.12));
    for (const z of [-0.45, 0.45]) g.add(this.at(this.cyl, m.black, 0, 0.12, z, 0.12, 0.06, 0.12, 0, 0, Math.PI / 2));
    g.add(this.at(this.cyl, m.greyLight, 0, 0.55, 0.45, 0.025, 0.85, 0.025, -0.12));
    g.add(this.part(m.black, 0.55, 0.04, 0.04, 0, 0.92, 0.5));
    g.add(this.part(m.teal, 0.22, 0.06, 0.6, 0, 0.2, 0));
    g.add(this.part(m.headlight, 0.08, 0.06, 0.03, 0, 0.82, 0.55));
    return g;
  }

  /** Seaside bench: jump over. */
  private makeBench() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-0.7, 0.7]) g.add(this.part(m.black, 0.08, 0.45, 0.45, x, 0));
    for (let i = 0; i < 3; i++) g.add(this.part(m.wood, 1.6, 0.05, 0.12, 0, 0.45, -0.14 + i * 0.14));
    for (let i = 0; i < 2; i++) g.add(this.part(m.wood, 1.6, 0.1, 0.05, 0, 0.6 + i * 0.13, -0.24));
    return g;
  }

  // ------------------------------------------------------------- collectibles
  /** Coin geometry with gold face and darker rim baked into vertex colours (one draw call). */
  makeCoinGeometry(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
    const g = new THREE.Group();
    const face = lambert(0xffd54a);
    const rim = lambert(0xc9951f);
    g.add(this.at(this.coinGeo, face, 0, 0, 0, 1, 1, 1));
    g.add(new THREE.Mesh(this.coinRimGeo, rim));
    for (const y of [0.08, -0.08]) g.add(this.at(this.cyl, rim, 0, y, 0, 0.2, 0.03, 0.2));
    const merged = mergedGroup(g, new Map(), { cast: true, receive: false });
    const mesh = merged.children[0] as THREE.Mesh;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x9a6406, emissiveIntensity: 0.7 });
    return { geometry: mesh.geometry, material };
  }

  /** Golden key collectible (revive currency). Stands upright, spins around Y. */
  makeKey(): THREE.Group {
    return this.cached("key", () => {
      const g = new THREE.Group();
      const m = this.mats.key;
      g.add(this.at(this.keyRingGeo, m, 0, 0.45, 0, 1, 1, 1));
      g.add(this.part(m, 0.1, 0.55, 0.1, 0, -0.3));
      g.add(this.part(m, 0.22, 0.09, 0.1, 0.1, -0.3));
      g.add(this.part(m, 0.16, 0.09, 0.1, 0.07, -0.14));
      g.add(this.at(this.sphere, this.mats.glow, 0, 0.1, 0, 0.55, 0.8, 0.55));
      return g;
    }, true, false);
  }

  /** Ferry token piece: unlocks the next district after three. */
  makeToken(): THREE.Group {
    return this.cached("token", () => {
      const g = new THREE.Group();
      const m = this.mats;
      g.add(this.at(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 28), m.token, 0, 0, 0, 1, 1, 1, Math.PI / 2));
      g.add(this.at(new THREE.TorusGeometry(0.52, 0.07, 8, 28), m.tokenGold, 0, 0, 0, 1, 1, 1));
      g.add(this.at(new THREE.TorusGeometry(0.18, 0.05, 8, 20), m.tokenGold, 0, 0, 0, 1, 1, 1));
      // Tiny ferry silhouette on the face.
      g.add(this.part(m.tokenGold, 0.5, 0.1, 0.02, 0, -0.32, 0.07));
      g.add(this.part(m.tokenGold, 0.25, 0.1, 0.02, 0.02, -0.22, 0.07));
      g.add(this.at(this.sphere, m.glow, 0, 0, 0, 0.9, 0.9, 0.5));
      return g;
    }, true, false);
  }

  makePowerup(kind: PowerupKind): THREE.Group {
    return this.cached(`pu:${kind}`, () => {
      const g = new THREE.Group();
      const m = this.mats;
      g.add(this.at(this.sphere, m.glow, 0, 0, 0, 0.7, 0.7, 0.7));
      if (kind === "magnet") {
        g.add(this.part(m.magnet, 0.55, 0.16, 0.16, 0, -0.35));
        g.add(this.part(m.magnet, 0.16, 0.4, 0.16, -0.2, -0.2));
        g.add(this.part(m.magnet, 0.16, 0.4, 0.16, 0.2, -0.2));
        g.add(this.part(m.magnetTip, 0.16, 0.14, 0.16, -0.2, 0.2));
        g.add(this.part(m.magnetTip, 0.16, 0.14, 0.16, 0.2, 0.2));
      } else if (kind === "x2") {
        g.add(new THREE.Mesh(this.octa, m.doubler));
      } else if (kind === "shield") {
        g.add(new THREE.Mesh(this.ico, m.shield));
      } else if (kind === "wings") {
        for (const s of [-1, 1]) {
          g.add(this.at(this.sphereLow, m.feather, s * 0.28, 0.05, 0, 0.32, 0.08, 0.16, 0, 0, s * 0.35));
          g.add(this.at(this.sphereLow, m.feather, s * 0.42, -0.08, 0, 0.2, 0.06, 0.12, 0, 0, s * 0.6));
        }
        g.add(this.at(this.sphereLow, m.beak, 0, 0, 0, 0.08, 0.08, 0.08));
      } else {
        g.add(this.part(m.carpet, 0.8, 0.05, 0.5, 0, -0.03));
        g.add(this.part(m.carpetGold, 0.6, 0.06, 0.3, 0, -0.03));
        for (const x of [-0.42, 0.42]) g.add(this.part(m.carpetGold, 0.06, 0.04, 0.5, x, -0.04));
      }
      return g;
    }, true, false);
  }

  /** Seagull that chases the runner after a stumble. Wings are separate so they can flap. */
  makeSeagull(): { group: THREE.Group; wingL: THREE.Object3D; wingR: THREE.Object3D } {
    const m = this.mats;
    const group = new THREE.Group();
    const body = this.cached("gull-body", () => {
      const g = new THREE.Group();
      g.add(this.at(this.sphereLow, m.feather, 0, 0, 0, 0.22, 0.2, 0.45));
      g.add(this.at(this.sphereLow, m.feather, 0, 0.12, -0.38, 0.14, 0.14, 0.15));
      g.add(this.at(this.cone, m.beak, 0, 0.1, -0.58, 0.05, 0.16, 0.05, -Math.PI / 2));
      g.add(this.at(this.sphereLow, m.black, 0.07, 0.16, -0.46, 0.025, 0.025, 0.025));
      g.add(this.at(this.sphereLow, m.black, -0.07, 0.16, -0.46, 0.025, 0.025, 0.025));
      g.add(this.part(m.grey, 0.25, 0.04, 0.25, 0, 0.0, 0.45));
      return g;
    }, true, false);
    group.add(body);
    const wing = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.15, 0.08, -0.05);
      pivot.add(this.part(m.grey, 0.75, 0.04, 0.32, side * 0.38, 0));
      pivot.add(this.part(m.black, 0.18, 0.045, 0.3, side * 0.7, 0));
      pivot.traverse((c) => ((c as THREE.Mesh).isMesh ? (c.castShadow = true) : null));
      group.add(pivot);
      return pivot;
    };
    return { group, wingL: wing(-1), wingR: wing(1) };
  }

  /** Small sparkle used for coin bursts. */
  readonly sparkleGeo = new THREE.OctahedronGeometry(0.09, 0);
  readonly sparkleMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, depthWrite: false });
}
