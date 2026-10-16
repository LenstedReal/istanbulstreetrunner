import * as THREE from "three";

import { CHUNK_LEN, NUM_CHUNKS } from "./constants";
import { ObjectFactory } from "./objects";
import { SCENE } from "./palette";
import { asphaltTexture, cobbleTexture, facadeTexture, roofTexture, sidewalkTexture } from "./textures";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const MAX_BUILDINGS_PER_SIDE = 5;
const MAX_WINDOWS = 420;
const MAX_BALCONIES = 10;
const MAX_ROOF_PROPS = 8;
const BOLLARDS = 20;
const TREES = 3;
const LAMPS = 2;
const BINS = 2;

const setShadow = (o: THREE.Object3D, cast: boolean, receive: boolean) => {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
};

/**
 * One 30 m slice of street: road, rails, sidewalks, buildings on both sides,
 * trees and lamp posts. Chunks are recycled as the runner passes them.
 */
class Chunk {
  group = new THREE.Group();
  private buildings: THREE.Mesh[] = [];
  private parapets: THREE.Mesh[] = [];
  private shopBands: THREE.Mesh[] = [];
  private domes: THREE.Mesh[] = [];
  private awnings: THREE.Mesh[] = [];
  private balconies: THREE.Group[] = [];
  private roofProps: THREE.Mesh[] = [];
  private windows: THREE.InstancedMesh;
  private trees: THREE.Group[] = [];
  private lamps: THREE.Group[] = [];
  private bins: THREE.Mesh[] = [];
  private manhole: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private litColor = new THREE.Color(SCENE.windowLit);
  private darkColor = new THREE.Color(SCENE.window);
  private tmpColor = new THREE.Color();

  constructor(private f: ObjectFactory, private buildingMats: THREE.MeshLambertMaterial[], shared: SharedMats) {
    const g = this.group;
    // Road & pavement
    const road = f.part(shared.asphalt, 8.2, 0.1, CHUNK_LEN, 0, -0.1, -CHUNK_LEN / 2);
    const cobble = f.part(shared.cobble, 2.0, 0.11, CHUNK_LEN, 0, -0.1, -CHUNK_LEN / 2);
    road.receiveShadow = cobble.receiveShadow = true;
    g.add(road, cobble);
    g.add(f.part(shared.rail, 0.1, 0.04, CHUNK_LEN, -0.7, 0, -CHUNK_LEN / 2));
    g.add(f.part(shared.rail, 0.1, 0.04, CHUNK_LEN, 0.7, 0, -CHUNK_LEN / 2));
    for (const side of [-1, 1]) {
      const sw = f.part(shared.sidewalk, 3.2, 0.22, CHUNK_LEN, side * 5.7, -0.1, -CHUNK_LEN / 2);
      sw.receiveShadow = true;
      g.add(sw);
      g.add(f.part(shared.curb, 0.12, 0.24, CHUNK_LEN, side * 4.12, -0.1, -CHUNK_LEN / 2));
      // Tram catenary pole + wire across the street
      const pole = new THREE.Mesh(f.cyl, shared.metal);
      pole.scale.set(0.09, 6.2, 0.09);
      pole.position.set(side * 4.6, 3.1, -CHUNK_LEN / 2 + side * 7);
      pole.castShadow = true;
      g.add(pole);
    }
    g.add(f.part(shared.wire, 9.4, 0.03, 0.03, 0, 5.9, -CHUNK_LEN / 2));
    g.add(f.part(shared.wire, 0.03, 0.03, CHUNK_LEN, -0.7, 5.6, -CHUNK_LEN / 2));
    g.add(f.part(shared.wire, 0.03, 0.03, CHUNK_LEN, 0.7, 5.6, -CHUNK_LEN / 2));

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
    // Curb bollards
    const bollards = new THREE.InstancedMesh(f.cyl, shared.bollard, BOLLARDS);
    n = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < BOLLARDS / 2; i++) {
        this.dummy.position.set(side * 4.35, 0.35, -1.5 - i * 3);
        this.dummy.scale.set(0.09, 0.7, 0.09);
        this.dummy.updateMatrix();
        bollards.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    bollards.castShadow = true;
    g.add(bollards);
    this.manhole = new THREE.Mesh(f.cyl, shared.bollard);
    this.manhole.scale.set(0.45, 0.02, 0.45);
    g.add(this.manhole);

    // Buildings (pre-created, repositioned on recycle)
    for (let i = 0; i < MAX_BUILDINGS_PER_SIDE * 2; i++) {
      const b = new THREE.Mesh(f.box, buildingMats[0]);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
      this.buildings.push(b);
      const parapet = new THREE.Mesh(f.box, shared.roof);
      g.add(parapet);
      this.parapets.push(parapet);
      const band = new THREE.Mesh(f.box, shared.shopBand);
      g.add(band);
      this.shopBands.push(band);
      const dome = new THREE.Mesh(f.sphere, shared.dome);
      dome.visible = false;
      g.add(dome);
      this.domes.push(dome);
      const awning = new THREE.Mesh(f.box, shared.awnings[0]);
      awning.visible = false;
      awning.castShadow = true;
      g.add(awning);
      this.awnings.push(awning);
    }
    for (let i = 0; i < MAX_BALCONIES; i++) {
      const b = new THREE.Group();
      const slab = f.part(shared.roof, 1.2, 0.14, 2.2, 0, 0, 0);
      const rail = f.part(shared.railing, 0.06, 0.9, 2.2, -0.57, 0.14, 0);
      const bar = f.part(shared.railing, 1.2, 0.05, 0.05, 0, 1.0, -1.08);
      const bar2 = f.part(shared.railing, 1.2, 0.05, 0.05, 0, 1.0, 1.08);
      slab.castShadow = true;
      b.add(slab, rail, bar, bar2);
      b.visible = false;
      g.add(b);
      this.balconies.push(b);
    }
    for (let i = 0; i < MAX_ROOF_PROPS; i++) {
      const p = new THREE.Mesh(f.box, shared.metal);
      p.visible = false;
      g.add(p);
      this.roofProps.push(p);
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
      const leaf2 = new THREE.Mesh(f.sphere, shared.treeLeafDark);
      leaf2.scale.set(1.0, 1.1, 1.0);
      leaf2.position.set(0.5, 1.8, 0.3);
      setShadow(t, true, false);
      t.add(trunk, leaf, leaf2);
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
      pole.castShadow = true;
      l.add(pole, arm, glow);
      g.add(l);
      this.lamps.push(l);
    }
    for (let i = 0; i < BINS; i++) {
      const bin = new THREE.Mesh(f.cyl, shared.bin);
      bin.scale.set(0.3, 0.9, 0.3);
      bin.castShadow = true;
      g.add(bin);
      this.bins.push(bin);
    }
    this.randomize();
  }

  randomize() {
    let bi = 0;
    let wi = 0;
    let bal = 0;
    let rp = 0;
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

        const parapet = this.parapets[bi];
        parapet.visible = true;
        parapet.scale.set(width + 0.3, 0.35, depth - 0.2);
        parapet.position.set(x, height + 0.1, zc);

        const band = this.shopBands[bi];
        band.visible = true;
        band.scale.set(0.12, 3.4, depth - 0.5);
        band.position.set(side * 6.15, 1.7, zc);

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

        // Balcony on a random upper floor
        if (bal < MAX_BALCONIES && height > 9 && depth > 5 && Math.random() < 0.6) {
          const g = this.balconies[bal++];
          g.visible = true;
          const floor = 2 + Math.floor(rand(1, Math.max(1, (height - 4) / 2.5)));
          g.position.set(side * (6.2 - 0.6), 1.9 + floor * 2.5 - 1.2, zc);
          g.rotation.y = side > 0 ? Math.PI : 0;
        }
        // Rooftop water tank / AC unit
        if (rp < MAX_ROOF_PROPS && Math.random() < 0.5) {
          const p = this.roofProps[rp++];
          p.visible = true;
          p.scale.set(rand(0.8, 1.4), rand(0.6, 1.2), rand(0.8, 1.4));
          p.position.set(x + rand(-width * 0.25, width * 0.25), height + p.scale.y / 2, zc + rand(-depth * 0.2, depth * 0.2));
        }

        // Windows on the street-facing wall, some lit
        const face = side * 6.2;
        for (let wz = cursor - 0.9; wz > cursor - depth + 0.6 && wi < MAX_WINDOWS; wz -= 1.6) {
          for (let wy = 4.6; wy < height - 1.2 && wi < MAX_WINDOWS; wy += 2.5) {
            d.position.set(face, wy, wz);
            d.scale.set(0.12, 1.05, 0.72);
            d.rotation.set(0, 0, 0);
            d.updateMatrix();
            this.windows.setMatrixAt(wi, d.matrix);
            this.tmpColor.copy(Math.random() < 0.3 ? this.litColor : this.darkColor);
            this.tmpColor.multiplyScalar(0.75 + Math.random() * 0.4);
            this.windows.setColorAt(wi, this.tmpColor);
            wi++;
          }
        }
        cursor -= depth + rand(0.3, 1.2);
        bi++;
        placed++;
      }
    }
    for (; bi < this.buildings.length; bi++) {
      this.buildings[bi].visible = false;
      this.parapets[bi].visible = false;
      this.shopBands[bi].visible = false;
      this.domes[bi].visible = false;
      this.awnings[bi].visible = false;
    }
    for (; bal < MAX_BALCONIES; bal++) this.balconies[bal].visible = false;
    for (; rp < MAX_ROOF_PROPS; rp++) this.roofProps[rp].visible = false;
    this.windows.count = wi;
    this.windows.instanceMatrix.needsUpdate = true;
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;

    for (const t of this.trees) {
      const side = Math.random() < 0.5 ? -1 : 1;
      t.position.set(side * rand(5.2, 6.4), 0, -rand(1, CHUNK_LEN - 1));
      t.scale.setScalar(rand(0.8, 1.25));
      t.rotation.y = rand(0, Math.PI * 2);
    }
    this.lamps.forEach((l, i) => {
      const side = i === 0 ? -1 : 1;
      l.position.set(side * 4.55, 0, -rand(2, CHUNK_LEN - 2));
      l.rotation.y = side > 0 ? Math.PI : 0;
    });
    this.bins.forEach((b, i) => {
      const side = i === 0 ? 1 : -1;
      b.visible = Math.random() < 0.7;
      b.position.set(side * rand(4.6, 5.2), 0.45, -rand(1, CHUNK_LEN - 1));
    });
    this.manhole.visible = Math.random() < 0.6;
    this.manhole.position.set(pick([-2.2, 2.2]), 0.0, -rand(2, CHUNK_LEN - 2));
  }
}

interface SharedMats {
  asphalt: THREE.Material;
  cobble: THREE.Material;
  rail: THREE.Material;
  wire: THREE.Material;
  sidewalk: THREE.Material;
  curb: THREE.Material;
  laneMark: THREE.Material;
  bollard: THREE.Material;
  bin: THREE.Material;
  roof: THREE.Material;
  shopBand: THREE.Material;
  railing: THREE.Material;
  dome: THREE.Material;
  awnings: THREE.Material[];
  window: THREE.Material;
  treeTrunk: THREE.Material;
  treeLeaf: THREE.Material;
  treeLeafDark: THREE.Material;
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
    const facade = facadeTexture();
    facade.repeat.set(1, 2);
    const buildingMats = SCENE.buildings.map((c) => new THREE.MeshLambertMaterial({ color: c, map: facade }));
    const asphalt = asphaltTexture();
    asphalt.repeat.set(2, 8);
    const cobble = cobbleTexture();
    cobble.repeat.set(1, 15);
    const sidewalk = sidewalkTexture();
    sidewalk.repeat.set(1.5, 14);
    const roof = roofTexture();
    const shared: SharedMats = {
      asphalt: new THREE.MeshLambertMaterial({ color: SCENE.asphalt, map: asphalt }),
      cobble: new THREE.MeshLambertMaterial({ color: SCENE.cobble, map: cobble }),
      rail: new THREE.MeshLambertMaterial({ color: SCENE.rail, emissive: 0x333333 }),
      wire: new THREE.MeshBasicMaterial({ color: 0x2a2a2a }),
      sidewalk: new THREE.MeshLambertMaterial({ color: SCENE.sidewalk, map: sidewalk }),
      curb: new THREE.MeshLambertMaterial({ color: SCENE.curb }),
      laneMark: new THREE.MeshLambertMaterial({ color: SCENE.laneMark }),
      bollard: new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
      bin: new THREE.MeshLambertMaterial({ color: 0x2f5d3a }),
      roof: new THREE.MeshLambertMaterial({ color: 0x8a7f72, map: roof }),
      shopBand: new THREE.MeshLambertMaterial({ color: 0x4d4541 }),
      railing: new THREE.MeshLambertMaterial({ color: 0x2a2626 }),
      dome: f.mats.dome,
      awnings: SHARED_AWNINGS,
      window: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.18 }),
      treeTrunk: new THREE.MeshLambertMaterial({ color: SCENE.treeTrunk }),
      treeLeaf: new THREE.MeshLambertMaterial({ color: SCENE.treeLeaf }),
      treeLeafDark: new THREE.MeshLambertMaterial({ color: 0x3f7030 }),
      metal: f.mats.metal,
      lampGlow: f.mats.lampGlow,
    };

    this.ground = f.part(new THREE.MeshLambertMaterial({ color: SCENE.ground }), 400, 0.1, 400, 0, -0.25, 0);
    this.ground.receiveShadow = true;
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
    const halo = new THREE.Mesh(f.sphere, new THREE.MeshBasicMaterial({ color: SCENE.sunDisc, fog: false, transparent: true, opacity: 0.22, depthWrite: false }));
    halo.scale.setScalar(26);
    halo.position.copy(sun.position);
    b.add(halo);

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff6ec, fog: false, emissive: 0x6a5a55 });
    for (const [x, y, s] of [
      [-120, 120, 18],
      [-70, 140, 12],
      [20, 150, 15],
      [110, 125, 20],
      [160, 145, 11],
    ] as const) {
      for (let i = 0; i < 3; i++) {
        const puff = new THREE.Mesh(f.sphere, cloudMat);
        puff.scale.set(s * (1.4 - i * 0.25), s * 0.5, s * 0.8);
        puff.position.set(x + i * s * 0.9 - s, y + i * 2.5, -40 - i * 3);
        b.add(puff);
      }
    }

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
