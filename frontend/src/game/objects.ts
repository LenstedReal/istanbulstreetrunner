import * as THREE from "three";

import { SCENE } from "./palette";

export type ObstacleKind = "tram" | "cart" | "barrier" | "sign" | "pillar";
export type PowerupKind = "magnet" | "x2" | "shield";

export interface ObstacleDef {
  kind: ObstacleKind;
  halfW: number;
  yMin: number;
  yMax: number;
  halfD: number;
}

// Collision boxes are a little smaller than the meshes so near misses feel fair.
export const OBSTACLE_DEFS: Record<ObstacleKind, ObstacleDef> = {
  tram: { kind: "tram", halfW: 0.9, yMin: 0, yMax: 3.0, halfD: 3.4 },
  cart: { kind: "cart", halfW: 0.72, yMin: 0, yMax: 0.95, halfD: 0.5 },
  barrier: { kind: "barrier", halfW: 0.8, yMin: 0, yMax: 0.9, halfD: 0.18 },
  sign: { kind: "sign", halfW: 0.9, yMin: 1.3, yMax: 2.1, halfD: 0.15 },
  pillar: { kind: "pillar", halfW: 0.42, yMin: 0, yMax: 3.4, halfD: 0.42 },
};

const lambert = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

export class ObjectFactory {
  readonly box = new THREE.BoxGeometry(1, 1, 1);
  readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  readonly sphere = new THREE.SphereGeometry(1, 12, 10);
  readonly coinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 18);
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
    coin: lambert(SCENE.coin, { emissive: 0x8a6210, emissiveIntensity: 0.6 }),
    magnet: lambert(SCENE.magnet),
    magnetTip: lambert(SCENE.magnetTip),
    shield: new THREE.MeshLambertMaterial({ color: SCENE.shield, transparent: true, opacity: 0.75, emissive: 0x005566 }),
    doubler: lambert(SCENE.doubler, { emissive: 0x6a4a00, emissiveIntensity: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
  };

  /** Box with its bottom face at `yBottom`. */
  part(mat: THREE.Material, w: number, h: number, d: number, x = 0, yBottom = 0, z = 0, geo: THREE.BufferGeometry = this.box) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, yBottom + h / 2, z);
    return m;
  }

  makeObstacle(kind: ObstacleKind): THREE.Group {
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
    }
  }

  /** Nostalgic red Istiklal tram, occupies one lane. Player approaches its +z face. */
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
    for (let i = 0; i < 5; i++) {
      g.add(this.part(m.tramGlass, 1.96, 0.75, 0.85, 0, 1.45, -2.6 + i * 1.3));
    }
    g.add(this.part(m.tramGlass, 1.4, 0.75, 0.12, 0, 1.45, 3.5));
    g.add(this.part(m.tramGlass, 1.4, 0.75, 0.12, 0, 1.45, -3.5));
    g.add(this.part(m.headlight, 0.3, 0.25, 0.08, -0.6, 0.95, 3.52));
    g.add(this.part(m.headlight, 0.3, 0.25, 0.08, 0.6, 0.95, 3.52));
    g.add(this.part(m.tramCream, 1.0, 0.3, 0.08, 0, 2.05, 3.52));
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
    for (const x of [-0.78, 0.78]) {
      const wheel = new THREE.Mesh(this.cyl, m.black);
      wheel.scale.set(0.3, 0.1, 0.3);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.3, 0);
      g.add(wheel);
    }
    g.add(this.part(m.metal, 0.05, 0.05, 0.9, -0.45, 0.9, 0));
    g.add(this.part(m.metal, 0.05, 0.05, 0.9, 0.45, 0.9, 0));
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(this.torus, m.simit);
      s.rotation.x = Math.PI / 2;
      s.position.set(-0.4 + (i % 3) * 0.4, 0.97 + Math.floor(i / 3) * 0.1, i < 3 ? -0.22 : 0.22);
      g.add(s);
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

  /** Overhead "yol çalışması" sign: roll under. */
  private makeSign() {
    const g = new THREE.Group();
    const m = this.mats;
    for (const x of [-0.9, 0.9]) {
      const pole = new THREE.Mesh(this.cyl, m.metal);
      pole.scale.set(0.06, 2.35, 0.06);
      pole.position.set(x, 1.175, 0);
      g.add(pole);
    }
    g.add(this.part(m.yellow, 1.9, 0.8, 0.08, 0, 1.3));
    for (let i = 0; i < 3; i++) g.add(this.part(m.black, 0.14, 0.82, 0.09, -0.6 + i * 0.6, 1.29));
    g.add(this.part(m.black, 1.9, 0.06, 0.09, 0, 1.3));
    g.add(this.part(m.black, 1.9, 0.06, 0.09, 0, 2.04));
    return g;
  }

  /** Ottoman style street lamp / fountain column: full block, change lane. */
  private makePillar() {
    const g = new THREE.Group();
    const m = this.mats;
    g.add(this.part(m.stoneDark, 1.0, 0.3, 1.0, 0, 0));
    const col = new THREE.Mesh(this.cyl, m.stone);
    col.scale.set(0.38, 2.4, 0.38);
    col.position.set(0, 1.5, 0);
    g.add(col);
    g.add(this.part(m.stoneDark, 0.9, 0.22, 0.9, 0, 2.7));
    g.add(this.part(m.lampGlow, 0.5, 0.55, 0.5, 0, 2.92));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.45, 4), m.dome);
    roof.position.set(0, 3.7, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    return g;
  }

  makeCoin(): THREE.Mesh {
    const c = new THREE.Mesh(this.coinGeo, this.mats.coin);
    c.rotation.x = Math.PI / 2;
    return c;
  }

  makePowerup(kind: PowerupKind): THREE.Group {
    const g = new THREE.Group();
    const glow = new THREE.Mesh(this.sphere, this.mats.glow);
    glow.scale.setScalar(0.7);
    g.add(glow);
    if (kind === "magnet") {
      g.add(this.part(this.mats.magnet, 0.55, 0.16, 0.16, 0, -0.35));
      g.add(this.part(this.mats.magnet, 0.16, 0.4, 0.16, -0.2, -0.2));
      g.add(this.part(this.mats.magnet, 0.16, 0.4, 0.16, 0.2, -0.2));
      g.add(this.part(this.mats.magnetTip, 0.16, 0.14, 0.16, -0.2, 0.2));
      g.add(this.part(this.mats.magnetTip, 0.16, 0.14, 0.16, 0.2, 0.2));
    } else if (kind === "x2") {
      g.add(new THREE.Mesh(this.octa, this.mats.doubler));
    } else {
      g.add(new THREE.Mesh(this.ico, this.mats.shield));
    }
    return g;
  }
}
