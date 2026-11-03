import * as THREE from "three";

import { CHUNK_LEN, NUM_CHUNKS } from "./constants";
import { DISTRICTS, type DistrictDef, type DistrictId } from "./districts";
import { bakeGroup } from "./merge";
import { ObjectFactory } from "./objects";
import { SCENE } from "./palette";
import { asphaltTexture, cobbleTexture, facadeTexture, roofTexture, sidewalkTexture } from "./textures";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

const MAX_BUILDINGS_PER_SIDE = 5;
const MAX_WINDOWS = 420;
const MAX_BALCONIES = 18;
const MAX_CUMBAS = 6;
const MAX_ROOF_PROPS = 8;
const BOLLARDS = 20;
const TREES = 3;
const LAMPS = 2;
const BINS = 2;
const PLANTERS = 2;
const RAILING_POSTS = 11;

/** 0: bare buildings, 1: balconies and signs, 2: every prop (from the quality profile). */
export type Detail = 0 | 1 | 2;

interface SharedMats {
  road: THREE.MeshLambertMaterial;
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
  window: THREE.Material;
  treeTrunk: THREE.Material;
  treeLeaf: THREE.Material;
  treeLeafDark: THREE.Material;
  palmLeaf: THREE.Material;
  cumba: THREE.Material;
  metal: THREE.Material;
  lampGlow: THREE.Material;
  bridgeRail: THREE.Material;
  globe: THREE.Material;
  frame: THREE.Material;
  shopGlass: THREE.Material;
  pot: THREE.Material;
  wood: THREE.Material;
}

/** Per-district building and awning materials, created once and shared by every chunk. */
interface DistrictMats {
  buildings: THREE.MeshLambertMaterial[];
  awnings: THREE.MeshLambertMaterial[];
}

/**
 * One 30 m slice of street. Its pieces live in an off-scene "source" group; after
 * every recycle the visible pieces are baked into a handful of meshes, so a chunk
 * costs about ten draw calls instead of ~90.
 */
class Chunk {
  readonly group = new THREE.Group();
  private src = new THREE.Group();
  private baked: THREE.Mesh[] = [];
  private buildings: THREE.Mesh[] = [];
  private parapets: THREE.Mesh[] = [];
  private shopBands: THREE.Mesh[] = [];
  private domes: THREE.Mesh[] = [];
  private awnings: THREE.Mesh[] = [];
  private balconies: THREE.Group[] = [];
  private cumbas: THREE.Group[] = [];
  private roofProps: THREE.Mesh[] = [];
  private windows: THREE.InstancedMesh;
  /** Cream window frames behind every window (same matrices, larger). */
  private frames: THREE.InstancedMesh;
  private shopGlass: THREE.Mesh[] = [];
  private planters: THREE.Group[] = [];
  private bench: THREE.Group;
  private trees: THREE.Group[] = [];
  private palms: THREE.Group[] = [];
  private lamps: THREE.Group[] = [];
  private bins: THREE.Mesh[] = [];
  private manhole: THREE.Mesh;
  private tramParts: THREE.Object3D[] = [];
  private bollards: THREE.InstancedMesh;
  private railings: THREE.Group[] = [];
  private sidewalks: THREE.Mesh[] = [];
  private curbs: THREE.Mesh[] = [];
  private cobbleStrip: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private litColor = new THREE.Color(SCENE.windowLit);
  private darkColor = new THREE.Color(SCENE.window);
  private tmpColor = new THREE.Color();

  constructor(
    f: ObjectFactory,
    shared: SharedMats,
    private bakedMats: Map<string, THREE.Material>,
  ) {
    const g = this.src;
    const road = f.part(shared.road, 8.2, 0.1, CHUNK_LEN, 0, -0.1, -CHUNK_LEN / 2);
    this.cobbleStrip = f.part(shared.cobble, 2.0, 0.11, CHUNK_LEN, 0, -0.1, -CHUNK_LEN / 2);
    g.add(road, this.cobbleStrip);
    const railL = f.part(shared.rail, 0.1, 0.04, CHUNK_LEN, -0.7, 0, -CHUNK_LEN / 2);
    const railR = f.part(shared.rail, 0.1, 0.04, CHUNK_LEN, 0.7, 0, -CHUNK_LEN / 2);
    g.add(railL, railR);
    this.tramParts.push(railL, railR, this.cobbleStrip);
    for (const side of [-1, 1]) {
      const sw = f.part(shared.sidewalk, 3.2, 0.22, CHUNK_LEN, side * 5.7, -0.1, -CHUNK_LEN / 2);
      g.add(sw);
      this.sidewalks.push(sw);
      const curb = f.part(shared.curb, 0.12, 0.24, CHUNK_LEN, side * 4.12, -0.1, -CHUNK_LEN / 2);
      g.add(curb);
      this.curbs.push(curb);
      const pole = new THREE.Mesh(f.cylLow, shared.metal);
      pole.scale.set(0.09, 6.2, 0.09);
      pole.position.set(side * 4.6, 3.1, -CHUNK_LEN / 2 + side * 7);
      g.add(pole);
      this.tramParts.push(pole);
      // Railing used on the bridge and along the sea.
      const r = new THREE.Group();
      r.add(f.part(shared.bridgeRail, 0.1, 0.08, CHUNK_LEN, 0, 1.05, -CHUNK_LEN / 2));
      r.add(f.part(shared.bridgeRail, 0.06, 0.05, CHUNK_LEN, 0, 0.55, -CHUNK_LEN / 2));
      for (let i = 0; i < RAILING_POSTS; i++) r.add(f.part(shared.bridgeRail, 0.09, 1.1, 0.09, 0, 0, -i * (CHUNK_LEN / (RAILING_POSTS - 1))));
      r.position.x = side * 7.2;
      r.visible = false;
      g.add(r);
      this.railings.push(r);
    }
    const wire1 = f.part(shared.wire, 9.4, 0.03, 0.03, 0, 5.9, -CHUNK_LEN / 2);
    const wire2 = f.part(shared.wire, 0.03, 0.03, CHUNK_LEN, -0.7, 5.6, -CHUNK_LEN / 2);
    const wire3 = f.part(shared.wire, 0.03, 0.03, CHUNK_LEN, 0.7, 5.6, -CHUNK_LEN / 2);
    g.add(wire1, wire2, wire3);
    this.tramParts.push(wire1, wire2, wire3);

    // Lane dashes and bollards stay instanced (one draw call each) in the live group.
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
    dashes.receiveShadow = true;
    this.group.add(dashes);
    this.bollards = new THREE.InstancedMesh(f.cylLow, shared.bollard, BOLLARDS);
    n = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < BOLLARDS / 2; i++) {
        this.dummy.position.set(side * 4.35, 0.35, -1.5 - i * 3);
        this.dummy.scale.set(0.09, 0.7, 0.09);
        this.dummy.updateMatrix();
        this.bollards.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    this.bollards.castShadow = true;
    this.group.add(this.bollards);
    this.manhole = new THREE.Mesh(f.cyl, shared.bollard);
    this.manhole.scale.set(0.45, 0.02, 0.45);
    g.add(this.manhole);

    for (let i = 0; i < MAX_BUILDINGS_PER_SIDE * 2; i++) {
      const b = new THREE.Mesh(f.box, shared.roof);
      g.add(b);
      this.buildings.push(b);
      const parapet = new THREE.Mesh(f.box, shared.roof);
      g.add(parapet);
      this.parapets.push(parapet);
      const band = new THREE.Mesh(f.box, shared.shopBand);
      g.add(band);
      this.shopBands.push(band);
      const dome = new THREE.Mesh(f.sphereLow, shared.dome);
      dome.visible = false;
      g.add(dome);
      this.domes.push(dome);
      const awning = new THREE.Mesh(f.box, shared.roof);
      awning.visible = false;
      g.add(awning);
      this.awnings.push(awning);
      // Warm lit shop window on the ground floor.
      const glass = new THREE.Mesh(f.box, shared.shopGlass);
      glass.visible = false;
      g.add(glass);
      this.shopGlass.push(glass);
    }
    for (let i = 0; i < MAX_BALCONIES; i++) {
      const b = new THREE.Group();
      b.add(f.part(shared.roof, 1.2, 0.14, 2.2, 0, 0, 0));
      b.add(f.part(shared.railing, 0.06, 0.9, 2.2, -0.57, 0.14, 0));
      b.add(f.part(shared.railing, 1.2, 0.05, 0.05, 0, 1.0, -1.08));
      b.add(f.part(shared.railing, 1.2, 0.05, 0.05, 0, 1.0, 1.08));
      b.visible = false;
      g.add(b);
      this.balconies.push(b);
    }
    for (let i = 0; i < MAX_CUMBAS; i++) {
      // Ottoman bay window: a closed wooden box hanging over the street.
      const c = new THREE.Group();
      c.add(f.part(shared.cumba, 1.0, 2.2, 2.6, 0, 0, 0));
      c.add(f.part(shared.roof, 1.15, 0.12, 2.8, 0, 2.2, 0));
      for (const z of [-0.8, 0, 0.8]) c.add(f.part(shared.window, 1.02, 0.9, 0.5, -0.0, 0.9, z));
      c.visible = false;
      g.add(c);
      this.cumbas.push(c);
    }
    for (let i = 0; i < MAX_ROOF_PROPS; i++) {
      const p = new THREE.Mesh(f.box, shared.metal);
      p.visible = false;
      g.add(p);
      this.roofProps.push(p);
    }
    this.windows = new THREE.InstancedMesh(f.box, shared.window, MAX_WINDOWS);
    this.group.add(this.windows);
    this.frames = new THREE.InstancedMesh(f.box, shared.frame, MAX_WINDOWS);
    this.group.add(this.frames);

    for (let i = 0; i < TREES; i++) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(f.cylLow, shared.treeTrunk);
      trunk.scale.set(0.14, 1.4, 0.14);
      trunk.position.y = 0.7;
      const leaf = new THREE.Mesh(f.icoTree, shared.treeLeaf);
      leaf.scale.set(1.35, 1.55, 1.35);
      leaf.position.y = 2.25;
      const leaf2 = new THREE.Mesh(f.icoTree, shared.treeLeafDark);
      leaf2.scale.set(0.95, 1.0, 0.95);
      leaf2.position.set(0.45, 1.85, 0.3);
      t.add(trunk, leaf, leaf2);
      g.add(t);
      this.trees.push(t);
      const p = new THREE.Group();
      const ptrunk = new THREE.Mesh(f.cylLow, shared.treeTrunk);
      ptrunk.scale.set(0.12, 4.2, 0.12);
      ptrunk.position.y = 2.1;
      p.add(ptrunk);
      for (let k = 0; k < 6; k++) {
        const fr = new THREE.Mesh(f.cone, shared.palmLeaf);
        const a = (k / 6) * Math.PI * 2;
        fr.scale.set(0.25, 1.6, 0.08);
        fr.position.set(Math.cos(a) * 0.65, 4.0, Math.sin(a) * 0.65);
        fr.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        p.add(fr);
      }
      p.visible = false;
      g.add(p);
      this.palms.push(p);
    }
    for (let i = 0; i < LAMPS; i++) {
      const l = new THREE.Group();
      // Black post with a white globe on top.
      const pole = new THREE.Mesh(f.cylLow, shared.railing);
      pole.scale.set(0.07, 3.5, 0.07);
      pole.position.y = 1.75;
      const base = new THREE.Mesh(f.cylLow, shared.railing);
      base.scale.set(0.14, 0.4, 0.14);
      base.position.y = 0.2;
      const neck = new THREE.Mesh(f.cylLow, shared.railing);
      neck.scale.set(0.12, 0.12, 0.12);
      neck.position.y = 3.5;
      const globe = new THREE.Mesh(f.sphere, shared.globe);
      globe.scale.setScalar(0.28);
      globe.position.y = 3.8;
      l.add(pole, base, neck, globe);
      g.add(l);
      this.lamps.push(l);
    }
    for (let i = 0; i < BINS; i++) {
      const bin = new THREE.Mesh(f.cylLow, shared.bin);
      bin.scale.set(0.3, 0.9, 0.3);
      g.add(bin);
      this.bins.push(bin);
    }
    for (let i = 0; i < PLANTERS; i++) {
      const p = new THREE.Group();
      p.add(f.part(shared.pot, 0.55, 0.45, 0.55, 0, 0));
      const bush = new THREE.Mesh(f.icoTree, shared.treeLeaf);
      bush.scale.setScalar(0.42);
      bush.position.y = 0.75;
      p.add(bush);
      g.add(p);
      this.planters.push(p);
    }
    this.bench = new THREE.Group();
    for (const z of [-0.65, 0.65]) this.bench.add(f.part(shared.railing, 0.42, 0.42, 0.08, 0, 0, z));
    this.bench.add(f.part(shared.wood, 0.45, 0.07, 1.5, 0, 0.42), f.part(shared.wood, 0.07, 0.4, 1.5, 0.2, 0.5));
    g.add(this.bench);
  }

  randomize(def: DistrictDef, mats: DistrictMats, detail: Detail) {
    let bi = 0;
    let wi = 0;
    let bal = 0;
    let cu = 0;
    let rp = 0;
    const d = this.dummy;
    for (const p of this.tramParts) p.visible = def.rails;
    this.cobbleStrip.visible = def.rails;
    for (const [i, side] of ([-1, 1] as const).entries()) {
      const kind = side < 0 ? def.left : def.right;
      this.railings[i].visible = kind !== "buildings";
      this.sidewalks[i].visible = true;
      this.curbs[i].visible = true;
      if (kind !== "buildings") continue;
      let cursor = 0;
      let placed = 0;
      const [fMin, fMax] = def.floors;
      while (cursor > -CHUNK_LEN + 2.5 && placed < MAX_BUILDINGS_PER_SIDE) {
        let depth = rand(5.5, 10);
        if (cursor - depth < -CHUNK_LEN) depth = -CHUNK_LEN - cursor;
        const width = rand(5, 8);
        const floors = Math.round(rand(fMin, fMax));
        const height = Math.random() < 0.12 ? floors * 2.5 + rand(6, 9) : floors * 2.5 + rand(1.5, 3);
        const x = side * (6.2 + width / 2);
        const zc = cursor - depth / 2;
        const b = this.buildings[bi];
        b.visible = true;
        b.material = pick(mats.buildings);
        b.scale.set(width, height, depth - 0.5);
        b.position.set(x, height / 2, zc);

        const parapet = this.parapets[bi];
        parapet.visible = true;
        parapet.scale.set(width + 0.3, 0.35, depth - 0.2);
        parapet.position.set(x, height + 0.1, zc);

        const shop = Math.random() < def.shopChance;
        const band = this.shopBands[bi];
        band.visible = shop;
        band.scale.set(0.12, 3.4, depth - 0.5);
        band.position.set(side * 6.15, 1.7, zc);
        const glass = this.shopGlass[bi];
        glass.visible = shop && depth > 3;
        glass.scale.set(0.06, 2.0, Math.max(1, depth - 2.2));
        glass.position.set(side * 6.08, 1.35, zc);

        const dome = this.domes[bi];
        if (Math.random() < def.domeChance) {
          const r = Math.min(width, depth) * 0.34;
          dome.visible = true;
          dome.scale.setScalar(r);
          dome.position.set(x, height, zc);
        } else dome.visible = false;

        const awning = this.awnings[bi];
        if (detail >= 1 && shop && Math.random() < 0.55 && depth > 4) {
          awning.visible = true;
          awning.material = pick(mats.awnings);
          awning.scale.set(1.1, 0.08, depth - 1.4);
          awning.position.set(side * (6.2 - 0.45), 3.1, zc);
          awning.rotation.z = side * 0.3;
        } else awning.visible = false;

        if (detail >= 1 && cu < MAX_CUMBAS && height > 8 && depth > 5 && Math.random() < def.cumbaChance) {
          const c = this.cumbas[cu++];
          c.visible = true;
          c.position.set(side * (6.2 - 0.5), 5.0 + Math.floor(rand(0, 2)) * 2.5, zc);
          c.rotation.y = side > 0 ? Math.PI : 0;
        } else if (detail >= 1 && height > 8 && depth > 5 && Math.random() < def.balconyChance) {
          // Balconies stacked on the upper floors, as on Istanbul apartment blocks.
          const floors = Math.max(1, Math.floor((height - 4.5) / 2.5));
          for (let fl = 1; fl <= floors && bal < MAX_BALCONIES; fl++) {
            if (fl > 1 && Math.random() < 0.25) continue;
            const g = this.balconies[bal++];
            g.visible = true;
            g.position.set(side * (6.2 - 0.6), 3.2 + fl * 2.5 - 1.2, zc);
            g.rotation.y = side > 0 ? Math.PI : 0;
          }
        }
        if (detail >= 2 && rp < MAX_ROOF_PROPS && Math.random() < 0.5) {
          const p = this.roofProps[rp++];
          p.visible = true;
          p.scale.set(rand(0.8, 1.4), rand(0.6, 1.2), rand(0.8, 1.4));
          p.position.set(x + rand(-width * 0.25, width * 0.25), height + p.scale.y / 2, zc + rand(-depth * 0.2, depth * 0.2));
        }

        const face = side * 6.2;
        for (let wz = cursor - 0.9; wz > cursor - depth + 0.6 && wi < MAX_WINDOWS; wz -= 1.6) {
          for (let wy = shop ? 4.6 : 2.1; wy < height - 1.2 && wi < MAX_WINDOWS; wy += 2.5) {
            d.position.set(face, wy, wz);
            d.scale.set(0.12, 1.05, 0.72);
            d.rotation.set(0, 0, 0);
            d.updateMatrix();
            this.windows.setMatrixAt(wi, d.matrix);
            this.tmpColor.copy(Math.random() < 0.3 ? this.litColor : this.darkColor);
            this.tmpColor.multiplyScalar(0.75 + Math.random() * 0.4);
            this.windows.setColorAt(wi, this.tmpColor);
            d.scale.set(0.1, 1.3, 0.95);
            d.updateMatrix();
            this.frames.setMatrixAt(wi, d.matrix);
            wi++;
          }
        }
        cursor -= depth + rand(0.3, 1.2);
        bi++;
        placed++;
      }
    }
    for (; bi < this.buildings.length; bi++) {
      this.shopGlass[bi].visible = false;
      this.buildings[bi].visible = false;
      this.parapets[bi].visible = false;
      this.shopBands[bi].visible = false;
      this.domes[bi].visible = false;
      this.awnings[bi].visible = false;
    }
    for (; bal < MAX_BALCONIES; bal++) this.balconies[bal].visible = false;
    for (; cu < MAX_CUMBAS; cu++) this.cumbas[cu].visible = false;
    for (; rp < MAX_ROOF_PROPS; rp++) this.roofProps[rp].visible = false;
    this.windows.count = wi;
    this.windows.instanceMatrix.needsUpdate = true;
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
    this.windows.visible = wi > 0;
    this.frames.count = detail >= 1 ? wi : 0;
    this.frames.instanceMatrix.needsUpdate = true;
    this.frames.visible = detail >= 1 && wi > 0;
    this.bollards.visible = def.left === "buildings" || def.right === "buildings";

    const sideOf = (s: -1 | 1) => (s < 0 ? def.left : def.right);
    for (let i = 0; i < TREES; i++) {
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const tree = this.trees[i];
      const palm = this.palms[i];
      tree.visible = detail >= 1 && def.trees === "plane";
      palm.visible = detail >= 1 && def.trees === "palm";
      const obj = palm.visible ? palm : tree;
      const sea = sideOf(side) !== "buildings";
      obj.position.set(side * rand(sea ? 5.0 : 5.2, sea ? 5.6 : 6.4), 0, -rand(1, CHUNK_LEN - 1));
      obj.scale.setScalar(rand(0.8, 1.25));
      obj.rotation.y = rand(0, Math.PI * 2);
    }
    this.lamps.forEach((l, i) => {
      const side = i === 0 ? -1 : 1;
      l.visible = detail >= 1;
      l.position.set(side * 4.55, 0, -rand(2, CHUNK_LEN - 2));
      l.rotation.y = side > 0 ? Math.PI : 0;
    });
    this.bins.forEach((b, i) => {
      const side = i === 0 ? 1 : -1;
      b.visible = detail >= 2 && Math.random() < 0.7;
      b.position.set(side * rand(4.6, 5.2), 0.45, -rand(1, CHUNK_LEN - 1));
    });
    this.planters.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      p.visible = detail >= 1 && sideOf(side) === "buildings";
      p.position.set(side * 5.75, 0, -rand(2, CHUNK_LEN - 2));
    });
    {
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      this.bench.visible = detail >= 2 && Math.random() < 0.6;
      this.bench.position.set(side * 5.6, 0, -rand(3, CHUNK_LEN - 3));
      this.bench.rotation.y = side > 0 ? Math.PI : 0;
    }
    this.manhole.visible = def.street !== "bridge" && Math.random() < 0.6;
    this.manhole.position.set(pick([-2.2, 2.2]), 0.0, -rand(2, CHUNK_LEN - 2));
    this.rebake();
  }

  /** Replace the previous baked meshes with fresh ones built from the visible source pieces. */
  private rebake() {
    for (const m of this.baked) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.baked = [];
    const { parts } = bakeGroup(this.src, this.bakedMats);
    for (const p of parts) {
      const mesh = new THREE.Mesh(p.geometry, p.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      this.baked.push(mesh);
    }
  }

  dispose() {
    for (const m of this.baked) m.geometry.dispose();
    this.baked = [];
  }
}

/** Far skyline variants, toggled per district. */
interface Backdrops {
  galata: THREE.Group;
  mosque: THREE.Group;
  golden_horn: THREE.Group;
  bosphorus: THREE.Group;
}

export class CityWorld {
  readonly group = new THREE.Group();
  readonly backdrop = new THREE.Group();
  private chunks: Chunk[] = [];
  private ground: THREE.Mesh;
  private sea: THREE.Mesh;
  private shared: SharedMats;
  private districtMats = new Map<DistrictId, DistrictMats>();
  private bakedMats = new Map<string, THREE.Material>();
  private facade: THREE.Texture;
  private textures: { asphalt: THREE.Texture; cobble: THREE.Texture; sidewalk: THREE.Texture };
  private sky!: THREE.Mesh;
  private sun!: THREE.Mesh;
  private halo!: THREE.Mesh;
  private backdrops!: Backdrops;
  private def: DistrictDef = DISTRICTS.istiklal;
  private viewDistance = 200;
  private detail: Detail = 2;

  constructor(scene: THREE.Scene, f: ObjectFactory, opts: { detail: Detail; anisotropy: number; viewDistance: number }) {
    this.detail = opts.detail;
    this.viewDistance = opts.viewDistance;
    this.facade = facadeTexture();
    this.facade.repeat.set(1, 2);
    const asphalt = asphaltTexture();
    asphalt.repeat.set(2, 8);
    const cobble = cobbleTexture();
    cobble.repeat.set(1, 15);
    const sidewalk = sidewalkTexture();
    sidewalk.repeat.set(1.5, 14);
    const roofTex = roofTexture();
    for (const t of [asphalt, cobble, sidewalk]) t.anisotropy = Math.max(1, opts.anisotropy);
    // Separate copies for the road so the street kind can swap its texture without touching sidewalks.
    const roadCobble = cobble.clone();
    roadCobble.repeat.set(4, 15);
    const roadPromenade = sidewalk.clone();
    roadPromenade.repeat.set(4, 14);
    for (const t of [roadCobble, roadPromenade]) t.needsUpdate = true;
    this.textures = { asphalt, cobble: roadCobble, sidewalk: roadPromenade };
    this.shared = {
      road: new THREE.MeshLambertMaterial({ color: SCENE.asphalt, map: asphalt }),
      cobble: new THREE.MeshLambertMaterial({ color: SCENE.cobble, map: cobble }),
      rail: new THREE.MeshLambertMaterial({ color: SCENE.rail, emissive: 0x333333 }),
      wire: new THREE.MeshBasicMaterial({ color: 0x2a2a2a }),
      sidewalk: new THREE.MeshLambertMaterial({ color: SCENE.sidewalk, map: sidewalk }),
      curb: new THREE.MeshLambertMaterial({ color: SCENE.curb }),
      laneMark: new THREE.MeshLambertMaterial({ color: SCENE.laneMark }),
      bollard: new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
      bin: new THREE.MeshLambertMaterial({ color: 0x2f5d3a }),
      roof: new THREE.MeshLambertMaterial({ color: 0x8a7f72, map: roofTex }),
      shopBand: new THREE.MeshLambertMaterial({ color: 0x4d4541 }),
      railing: new THREE.MeshLambertMaterial({ color: 0x2a2626 }),
      dome: f.mats.dome,
      window: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.18 }),
      treeTrunk: new THREE.MeshLambertMaterial({ color: SCENE.treeTrunk }),
      treeLeaf: new THREE.MeshLambertMaterial({ color: 0x4f9a3a, flatShading: true }),
      treeLeafDark: new THREE.MeshLambertMaterial({ color: 0x3c7f2e, flatShading: true }),
      palmLeaf: new THREE.MeshLambertMaterial({ color: 0x4a8f3a, flatShading: true }),
      cumba: new THREE.MeshLambertMaterial({ color: 0x7a4a2c, map: roofTex }),
      metal: f.mats.metal,
      lampGlow: f.mats.lampGlow,
      bridgeRail: new THREE.MeshLambertMaterial({ color: 0x5b6670 }),
      globe: new THREE.MeshLambertMaterial({ color: 0xfffaf0, emissive: 0xfff1d2, emissiveIntensity: 0.55 }),
      frame: new THREE.MeshLambertMaterial({ color: 0xf1e8d6 }),
      shopGlass: new THREE.MeshLambertMaterial({ color: 0xffd58a, emissive: 0xffb44d, emissiveIntensity: 0.55 }),
      pot: new THREE.MeshLambertMaterial({ color: 0xb4583a }),
      wood: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
    };

    this.ground = f.part(new THREE.MeshLambertMaterial({ color: SCENE.ground }), 400, 0.1, 400, 0, -0.25, 0);
    this.ground.receiveShadow = true;
    scene.add(this.ground);
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600, 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x2e6688, specular: 0x9fc4dd, shininess: 70, emissive: 0x0b2235 }),
    );
    this.sea.position.y = -0.6;
    this.sea.receiveShadow = true;
    this.sea.visible = false;
    scene.add(this.sea);

    for (let i = 0; i < NUM_CHUNKS; i++) {
      const c = new Chunk(f, this.shared, this.bakedMats);
      this.chunks.push(c);
      this.group.add(c.group);
    }
    scene.add(this.group);

    this.buildBackdrop(f);
    scene.add(this.backdrop);
    this.applyDistrict(this.def);
    this.reset();
  }

  private matsFor(def: DistrictDef): DistrictMats {
    let m = this.districtMats.get(def.id);
    if (!m) {
      m = {
        buildings: def.buildingColors.map((c) => new THREE.MeshLambertMaterial({ color: c, map: this.facade })),
        awnings: def.awningColors.map((c) => new THREE.MeshLambertMaterial({ color: c })),
      };
      this.districtMats.set(def.id, m);
    }
    return m;
  }

  get district(): DistrictDef {
    return this.def;
  }

  /** Switch the look of the street; the next reset() rebuilds every chunk with it. */
  setDistrict(id: DistrictId) {
    const def = DISTRICTS[id] ?? DISTRICTS.istiklal;
    if (def === this.def) return;
    this.def = def;
    this.applyDistrict(def);
  }

  private applyDistrict(def: DistrictDef) {
    const road = this.shared.road;
    if (def.street === "cobble") {
      road.map = this.textures.cobble;
      road.color.set(SCENE.cobble);
    } else if (def.street === "promenade") {
      road.map = this.textures.sidewalk;
      road.color.set(0xc4b7a2);
    } else if (def.street === "bridge") {
      road.map = this.textures.asphalt;
      road.color.set(0x66625e);
    } else {
      road.map = this.textures.asphalt;
      road.color.set(SCENE.asphalt);
    }
    road.needsUpdate = true;
    // Baked chunk materials are clones; drop them so the new road texture is picked up.
    for (const m of this.bakedMats.values()) m.dispose();
    this.bakedMats.clear();

    const water = def.left !== "buildings" || def.right !== "buildings";
    this.sea.visible = water;
    this.ground.visible = !water;
    (this.ground.material as THREE.MeshLambertMaterial).color.set(def.ground);

    const colors = this.sky.geometry.getAttribute("color") as THREE.BufferAttribute;
    const top = new THREE.Color(def.sky);
    const bottom = new THREE.Color(def.haze);
    [top, top, bottom, bottom].forEach((c, i) => colors.setXYZ(i, c.r, c.g, c.b));
    colors.needsUpdate = true;
    this.sun.position.x = def.sun.dir[0] >= 0 ? 70 : -70;
    this.halo.position.copy(this.sun.position);
    for (const [k, g] of Object.entries(this.backdrops)) g.visible = k === def.backdrop;
  }

  reset() {
    const mats = this.matsFor(this.def);
    this.chunks.forEach((c, i) => {
      c.group.position.z = CHUNK_LEN - i * CHUNK_LEN;
      c.randomize(this.def, mats, this.detail);
    });
  }

  update(playerZ: number) {
    let minZ = Infinity;
    for (const c of this.chunks) minZ = Math.min(minZ, c.group.position.z);
    const mats = this.matsFor(this.def);
    for (const c of this.chunks) {
      if (c.group.position.z - CHUNK_LEN > playerZ + 22) {
        c.group.position.z = minZ - CHUNK_LEN;
        minZ = c.group.position.z;
        c.randomize(this.def, mats, this.detail);
      }
      // Chunks past the fog end are invisible anyway; skip drawing them.
      c.group.visible = playerZ - c.group.position.z < this.viewDistance + 10;
    }
    this.ground.position.z = playerZ - 100;
    this.sea.position.z = playerZ - 150;
    this.backdrop.position.z = playerZ - 215;
  }

  dispose() {
    for (const c of this.chunks) c.dispose();
  }

  // --------------------------------------------------------------- backdrop
  private buildBackdrop(f: ObjectFactory) {
    const b = this.backdrop;
    const skyGeo = new THREE.PlaneGeometry(1400, 520, 1, 1);
    skyGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    this.sky.position.set(0, 180, -30);
    this.sky.renderOrder = -10;
    b.add(this.sky);

    // The sun is bright enough to feed the bloom pass on high/ultra.
    this.sun = new THREE.Mesh(f.sphere, new THREE.MeshBasicMaterial({ color: new THREE.Color(SCENE.sunDisc).multiplyScalar(2.2), fog: false }));
    this.sun.scale.setScalar(14);
    this.sun.position.set(70, 95, -25);
    b.add(this.sun);
    this.halo = new THREE.Mesh(f.sphere, new THREE.MeshBasicMaterial({ color: SCENE.sunDisc, fog: false, transparent: true, opacity: 0.22, depthWrite: false }));
    this.halo.scale.setScalar(26);
    this.halo.position.copy(this.sun.position);
    b.add(this.halo);

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false, emissive: 0x9a9a9a });
    const clouds = new THREE.Group();
    for (const [x, y, s] of [[-120, 120, 18], [-70, 140, 12], [20, 150, 15], [110, 125, 20], [160, 145, 11]] as const) {
      for (let i = 0; i < 3; i++) {
        const puff = new THREE.Mesh(f.sphereLow, cloudMat);
        puff.scale.set(s * (1.4 - i * 0.25), s * 0.5, s * 0.8);
        puff.position.set(x + i * s * 0.9 - s, y + i * 2.5, -40 - i * 3);
        clouds.add(puff);
      }
    }
    b.add(this.bakeInto(clouds));

    const far = new THREE.MeshLambertMaterial({ color: SCENE.backdropFar, fog: false });
    const near = new THREE.MeshLambertMaterial({ color: SCENE.backdrop, fog: false });
    const hills = (g: THREE.Group, list: readonly (readonly [number, number])[]) => {
      for (const [x, r] of list) {
        const hill = new THREE.Mesh(f.sphereLow, far);
        hill.scale.set(r * 1.8, r * 0.55, r);
        hill.position.set(x, -r * 0.1, -20);
        g.add(hill);
      }
    };
    const mosque = (g: THREE.Group, cx: number, s: number) => {
      const dome = new THREE.Mesh(f.sphere, near);
      dome.scale.setScalar(16 * s);
      dome.position.set(cx, 14 * s, 0);
      g.add(dome);
      g.add(f.part(near, 40 * s, 16 * s, 32 * s, cx, 0, 0));
      for (const dx of [-16, 16]) {
        const hd = new THREE.Mesh(f.sphere, near);
        hd.scale.set(9 * s, 7 * s, 9 * s);
        hd.position.set(cx + dx * s, 14 * s, 0);
        g.add(hd);
      }
      for (const [dx, dz] of [[-26, -20], [26, -20], [-26, 20], [26, 20]] as const) {
        const m = new THREE.Mesh(f.cyl, near);
        m.scale.set(1.8 * s, 48 * s, 1.8 * s);
        m.position.set(cx + dx * s, 24 * s, dz * s);
        g.add(m);
        const tip = new THREE.Mesh(f.cone, near);
        tip.scale.set(2.2 * s, 7 * s, 2.2 * s);
        tip.position.set(cx + dx * s, 51 * s, dz * s);
        g.add(tip);
      }
    };
    const stone = new THREE.MeshLambertMaterial({ color: 0xd8c6a4, fog: false });
    const stoneDark = new THREE.MeshLambertMaterial({ color: 0xb59f7d, fog: false });
    const slate = new THREE.MeshLambertMaterial({ color: 0x4d5a66, fog: false });
    const hole = new THREE.MeshLambertMaterial({ color: 0x2c2723, fog: false });
    /** Galata Tower: stone shaft, arched window ring, gallery and slate cone. */
    const tower = (g: THREE.Group, x: number, s: number, z = 10) => {
      const r = 7 * s;
      const shaft = new THREE.Mesh(f.cyl, stone);
      shaft.scale.set(r, 40 * s, r);
      shaft.position.set(x, 20 * s, z);
      g.add(shaft);
      for (const y of [12, 24, 33]) g.add(f.part(stoneDark, r * 2.04, 0.8 * s, r * 2.04, x, y * s, z, f.cyl));
      const ring = (y: number, hgt: number, n: number) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const w = new THREE.Mesh(f.box, hole);
          w.scale.set(1.3 * s, hgt * s, 0.6 * s);
          w.position.set(x + Math.sin(a) * r, y * s, z + Math.cos(a) * r);
          w.rotation.y = a;
          g.add(w);
        }
      };
      ring(18, 3, 8);
      ring(29, 3, 8);
      ring(38, 3.4, 12);
      g.add(f.part(stone, r * 2.3, 1 * s, r * 2.3, x, 40 * s, z, f.cyl));
      g.add(f.part(hole, r * 2.32, 0.15 * s, r * 2.32, x, 41.6 * s, z, f.cyl));
      const cap = new THREE.Mesh(f.cone, slate);
      cap.scale.set(r * 1.08, 16 * s, r * 1.08);
      cap.position.set(x, 49 * s, z);
      g.add(cap);
      g.add(f.part(slate, 0.4 * s, 4 * s, 0.4 * s, x, 57 * s, z, f.cyl));
    };
    const waterStrip = (g: THREE.Group) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1400, 120).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5d8fb0, fog: false, emissive: 0x1a3a50 }));
      w.position.set(0, -0.5, 30);
      g.add(w);
    };

    const galata = new THREE.Group();
    hills(galata, [[-160, 70], [-60, 55], [40, 60], [150, 75]]);
    mosque(galata, -75, 0.8);
    // The tower stands at the end of the street, as seen from Istiklal.
    tower(galata, 6, 1.5, -70);
    const mosqueGroup = new THREE.Group();
    hills(mosqueGroup, [[-170, 60], [-30, 70], [120, 65]]);
    mosque(mosqueGroup, 10, 1.35);
    tower(mosqueGroup, 110, 0.6);
    const golden = new THREE.Group();
    hills(golden, [[-150, 80], [0, 65], [160, 70]]);
    waterStrip(golden);
    mosque(golden, -70, 1.1);
    mosque(golden, 60, 0.7);
    tower(golden, 130, 0.8);
    const bosphorus = new THREE.Group();
    hills(bosphorus, [[-170, 85], [-40, 75], [110, 90]]);
    waterStrip(bosphorus);
    // Suspension bridge: two towers, a deck and the main cable as a chain of boxes.
    const span = 240;
    for (const x of [-span / 2, span / 2]) {
      bosphorus.add(f.part(near, 3, 70, 3, x - 4, 0, 0));
      bosphorus.add(f.part(near, 3, 70, 3, x + 4, 0, 0));
      bosphorus.add(f.part(near, 11, 3, 3, x, 66, 0));
    }
    bosphorus.add(f.part(near, span + 140, 2.5, 6, 0, 38, 0));
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = -span / 2 + t * span;
      const y = 70 - Math.sin(t * Math.PI) * 28;
      bosphorus.add(f.part(near, span / 24 + 0.6, 0.9, 0.9, x, y, 0));
      if (i % 2 === 0) bosphorus.add(f.part(near, 0.4, y - 40, 0.4, x, 40.5, 0));
    }
    mosque(bosphorus, 10, 0.45);

    this.backdrops = {
      galata: this.bakeInto(galata),
      mosque: this.bakeInto(mosqueGroup),
      golden_horn: this.bakeInto(golden),
      bosphorus: this.bakeInto(bosphorus),
    };
    for (const g of Object.values(this.backdrops)) b.add(g);
  }

  /** Static skyline pieces never move relative to each other: bake them once. */
  private bakeInto(src: THREE.Group): THREE.Group {
    const out = new THREE.Group();
    const { parts } = bakeGroup(src, new Map());
    for (const p of parts) {
      const mesh = new THREE.Mesh(p.geometry, p.material);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.add(mesh);
    }
    return out;
  }
}
