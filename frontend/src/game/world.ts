import * as THREE from "three";

import { CHUNK_LEN, NUM_CHUNKS } from "./constants";
import { ObjectFactory } from "./objects";
import { SCENE } from "./palette";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const MAX_BUILDINGS_PER_SIDE = 5;
const MAX_WINDOWS = 420;
const TREES = 3;
const LAMPS = 2;

/**
 * One 30 m slice of street: road, rails, sidewalks, buildings on both sides,
 * trees and lamp posts. Chunks are recycled as the runner passes them.
 */
class Chunk {
  group = new THREE.Group();
  private buildings: THREE.Mesh[] = [];
  private domes: THREE.Mesh[] = [];
  private awnings: THREE.Mesh[] = [];
  private windows: THREE.InstancedMesh;
  private trees: THREE.Group[] = [];
  private lamps: THREE.Group[] = [];
  private dummy = new THREE.Object3D();

  constructor(private f: ObjectFactory, private buildingMats: THREE.MeshLambertMaterial[], shared: SharedMats) {
    const g = this.group;
    // Road & pavement
    g.add(f.part(shared.asphalt, 8.2, 0.1, CHUNK_LEN, 0, -0.1, -CHUNK_LEN / 2));
    g.add(f.part(shared.cobble, 2.0, 0.11, CHUNK_LEN, 0, -0.1, -CHUNK_LEN / 2));
    g.add(f.part(shared.rail, 0.1, 0.04, CHUNK_LEN, -0.7, 0, -CHUNK_LEN / 2));
    g.add(f.part(shared.rail, 0.1, 0.04, CHUNK_LEN, 0.7, 0, -CHUNK_LEN / 2));
    for (const side of [-1, 1]) {
      g.add(f.part(shared.sidewalk, 3.2, 0.22, CHUNK_LEN, side * 5.7, -0.1, -CHUNK_LEN / 2));
      g.add(f.part(shared.curb, 0.12, 0.24, CHUNK_LEN, side * 4.12, -0.1, -CHUNK_LEN / 2));
    }
    // Lane dashes
    const dashes = new THREE.InstancedMesh(f.box, shared.laneMark, 20);
    let n = 0;
    for (const x of [-1.1, 1.1]) {
      for (let i = 0; i < 10; i++) {
        this.dummy.position.set(x, 0.005, -1.5 - i * 3);
        this.dummy.scale.set(0.12, 0.01, 1.4);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        dashes.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    g.add(dashes);

    // Buildings (pre-created, repositioned on recycle)
    for (let i = 0; i < MAX_BUILDINGS_PER_SIDE * 2; i++) {
      const b = new THREE.Mesh(f.box, buildingMats[0]);
      g.add(b);
      this.buildings.push(b);
      const dome = new THREE.Mesh(f.sphere, shared.dome);
      dome.visible = false;
      g.add(dome);
      this.domes.push(dome);
      const awning = new THREE.Mesh(f.box, shared.awnings[0]);
      awning.visible = false;
      g.add(awning);
      this.awnings.push(awning);
    }
    this.windows = new THREE.InstancedMesh(f.box, shared.window, MAX_WINDOWS);
    g.add(this.windows);

    for (let i = 0; i < TREES; i++) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(f.cyl, shared.treeTrunk);
      trunk.scale.set(0.14, 1.4, 0.14);
      trunk.position.y = 0.7;
      const leaf = new THREE.Mesh(f.sphere, shared.treeLeaf);
      leaf.scale.set(1.3, 1.5, 1.3);
      leaf.position.y = 2.1;
      t.add(trunk, leaf);
      g.add(t);
      this.trees.push(t);
    }
    for (let i = 0; i < LAMPS; i++) {
      const l = new THREE.Group();
      const pole = new THREE.Mesh(f.cyl, shared.metal);
      pole.scale.set(0.07, 3.6, 0.07);
      pole.position.y = 1.8;
      const arm = f.part(shared.metal, 0.8, 0.06, 0.06, 0, 3.55);
      const glow = new THREE.Mesh(f.sphere, shared.lampGlow);
      glow.scale.setScalar(0.22);
      glow.position.set(0, 3.45, 0);
      l.add(pole, arm, glow);
      g.add(l);
      this.lamps.push(l);
    }
    this.randomize();
  }

  randomize() {
    let bi = 0;
    let wi = 0;
    const d = this.dummy;
    for (const side of [-1, 1]) {
      let cursor = 0;
      let placed = 0;
      while (cursor > -CHUNK_LEN + 2.5 && placed < MAX_BUILDINGS_PER_SIDE) {
        let depth = rand(5.5, 10);
        if (cursor - depth < -CHUNK_LEN) depth = -CHUNK_LEN - cursor;
        const width = rand(5, 8);
        const height = Math.random() < 0.15 ? rand(18, 24) : rand(7, 17);
        const x = side * (6.2 + width / 2);
        const zc = cursor - depth / 2;
        const b = this.buildings[bi];
        b.visible = true;
        b.material = pick(this.buildingMats);
        b.scale.set(width, height, depth - 0.5);
        b.position.set(x, height / 2, zc);

        const dome = this.domes[bi];
        if (Math.random() < 0.2) {
          const r = Math.min(width, depth) * 0.34;
          dome.visible = true;
          dome.scale.setScalar(r);
          dome.position.set(x, height, zc);
        } else dome.visible = false;

        const awning = this.awnings[bi];
        if (Math.random() < 0.45 && depth > 4) {
          awning.visible = true;
          awning.material = pick(SHARED_AWNINGS);
          awning.scale.set(1.1, 0.08, depth - 1.4);
          awning.position.set(side * (6.2 - 0.45), 3.1, zc);
          awning.rotation.z = side * 0.3;
        } else awning.visible = false;

        // Windows on the street-facing wall
        const face = side * 6.2;
        for (let wz = cursor - 0.9; wz > cursor - depth + 0.6 && wi < MAX_WINDOWS; wz -= 1.6) {
          for (let wy = 1.9; wy < height - 1.2 && wi < MAX_WINDOWS; wy += 2.5) {
            d.position.set(face, wy, wz);
            d.scale.set(0.12, 1.05, 0.72);
            d.rotation.set(0, 0, 0);
            d.updateMatrix();
            this.windows.setMatrixAt(wi++, d.matrix);
          }
        }
        cursor -= depth + rand(0.3, 1.2);
        bi++;
        placed++;
      }
    }
    for (; bi < this.buildings.length; bi++) {
      this.buildings[bi].visible = false;
      this.domes[bi].visible = false;
      this.awnings[bi].visible = false;
    }
    this.windows.count = wi;
    this.windows.instanceMatrix.needsUpdate = true;

    for (const t of this.trees) {
      const side = Math.random() < 0.5 ? -1 : 1;
      t.position.set(side * rand(5.2, 6.4), 0, -rand(1, CHUNK_LEN - 1));
      t.scale.setScalar(rand(0.8, 1.25));
    }
    this.lamps.forEach((l, i) => {
      const side = i === 0 ? -1 : 1;
      l.position.set(side * 4.55, 0, -rand(2, CHUNK_LEN - 2));
      l.rotation.y = side > 0 ? Math.PI : 0;
    });
  }
}

interface SharedMats {
  asphalt: THREE.Material;
  cobble: THREE.Material;
  rail: THREE.Material;
  sidewalk: THREE.Material;
  curb: THREE.Material;
  laneMark: THREE.Material;
  dome: THREE.Material;
  awnings: THREE.Material[];
  window: THREE.Material;
  treeTrunk: THREE.Material;
  treeLeaf: THREE.Material;
  metal: THREE.Material;
  lampGlow: THREE.Material;
}

const SHARED_AWNINGS = [SCENE.awningA, SCENE.awningB, SCENE.awningC].map((c) => new THREE.MeshLambertMaterial({ color: c }));

export class CityWorld {
  readonly group = new THREE.Group();
  readonly backdrop = new THREE.Group();
  private chunks: Chunk[] = [];
  private ground: THREE.Mesh;

  constructor(scene: THREE.Scene, f: ObjectFactory) {
    const buildingMats = SCENE.buildings.map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const shared: SharedMats = {
      asphalt: new THREE.MeshLambertMaterial({ color: SCENE.asphalt }),
      cobble: new THREE.MeshLambertMaterial({ color: SCENE.cobble }),
      rail: new THREE.MeshLambertMaterial({ color: SCENE.rail }),
      sidewalk: new THREE.MeshLambertMaterial({ color: SCENE.sidewalk }),
      curb: new THREE.MeshLambertMaterial({ color: SCENE.curb }),
      laneMark: new THREE.MeshLambertMaterial({ color: SCENE.laneMark }),
      dome: f.mats.dome,
      awnings: SHARED_AWNINGS,
      window: new THREE.MeshLambertMaterial({ color: SCENE.window, emissive: SCENE.windowLit, emissiveIntensity: 0.12 }),
      treeTrunk: new THREE.MeshLambertMaterial({ color: SCENE.treeTrunk }),
      treeLeaf: new THREE.MeshLambertMaterial({ color: SCENE.treeLeaf }),
      metal: f.mats.metal,
      lampGlow: f.mats.lampGlow,
    };

    this.ground = f.part(new THREE.MeshLambertMaterial({ color: SCENE.ground }), 400, 0.1, 400, 0, -0.25, 0);
    scene.add(this.ground);

    for (let i = 0; i < NUM_CHUNKS; i++) {
      const c = new Chunk(f, buildingMats, shared);
      this.chunks.push(c);
      this.group.add(c.group);
    }
    this.reset();
    scene.add(this.group);

    this.buildBackdrop(f);
    scene.add(this.backdrop);
  }

  reset() {
    this.chunks.forEach((c, i) => {
      c.group.position.z = CHUNK_LEN - i * CHUNK_LEN;
      c.randomize();
    });
  }

  update(playerZ: number) {
    let minZ = Infinity;
    for (const c of this.chunks) minZ = Math.min(minZ, c.group.position.z);
    for (const c of this.chunks) {
      if (c.group.position.z - CHUNK_LEN > playerZ + 22) {
        c.group.position.z = minZ - CHUNK_LEN;
        minZ = c.group.position.z;
        c.randomize();
      }
    }
    this.ground.position.z = playerZ - 100;
    this.backdrop.position.z = playerZ - 215;
  }

  /** Far skyline: sky gradient, hazy hills, a great mosque, Galata tower, the sun. */
  private buildBackdrop(f: ObjectFactory) {
    const b = this.backdrop;
    const skyGeo = new THREE.PlaneGeometry(1400, 520, 1, 1);
    const colors = new Float32Array(4 * 3);
    const top = new THREE.Color(SCENE.sky);
    const bottom = new THREE.Color(SCENE.haze);
    [top, top, bottom, bottom].forEach((c, i) => colors.set([c.r, c.g, c.b], i * 3));
    skyGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    sky.position.set(0, 180, -30);
    sky.renderOrder = -10;
    b.add(sky);

    const sun = new THREE.Mesh(f.sphere, new THREE.MeshBasicMaterial({ color: SCENE.sunDisc, fog: false }));
    sun.scale.setScalar(14);
    sun.position.set(70, 95, -25);
    b.add(sun);

    const far = new THREE.MeshLambertMaterial({ color: SCENE.backdropFar, fog: false });
    const near = new THREE.MeshLambertMaterial({ color: SCENE.backdrop, fog: false });
    for (const [x, r] of [
      [-160, 70],
      [-60, 55],
      [40, 60],
      [150, 75],
    ] as const) {
      const hill = new THREE.Mesh(f.sphere, far);
      hill.scale.set(r * 1.8, r * 0.55, r);
      hill.position.set(x, -r * 0.1, -20);
      b.add(hill);
    }
    // Mosque: central dome, half domes, four minarets
    const dome = new THREE.Mesh(f.sphere, near);
    dome.scale.setScalar(16);
    dome.position.set(-45, 14, 0);
    b.add(dome);
    b.add(f.part(near, 40, 16, 32, -45, 0, 0));
    for (const [dx, dz] of [
      [-16, 0],
      [16, 0],
    ] as const) {
      const hd = new THREE.Mesh(f.sphere, near);
      hd.scale.set(9, 7, 9);
      hd.position.set(-45 + dx, 14, dz);
      b.add(hd);
    }
    for (const [dx, dz] of [
      [-26, -20],
      [26, -20],
      [-26, 20],
      [26, 20],
    ] as const) {
      const m = new THREE.Mesh(f.cyl, near);
      m.scale.set(1.8, 48, 1.8);
      m.position.set(-45 + dx, 24, dz);
      b.add(m);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 8), near);
      tip.position.set(-45 + dx, 51, dz);
      b.add(tip);
    }
    // Galata tower
    const tower = new THREE.Mesh(f.cyl, near);
    tower.scale.set(7, 42, 7);
    tower.position.set(58, 21, 10);
    b.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(8.5, 14, 12), near);
    cap.position.set(58, 49, 10);
    b.add(cap);
  }
}
