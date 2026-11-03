import * as THREE from "three";

import type { RunnerLook } from "../wardrobe";
import { ObjectFactory } from "./objects";
import { SCENE } from "./palette";

export const DEFAULT_LOOK: RunnerLook = {
  skin: SCENE.skin,
  hair: SCENE.hair,
  hairStyle: "short",
  jacket: SCENE.jacket,
  jacketTrim: SCENE.jacketDark,
  pants: SCENE.pants,
  shoes: SCENE.shoes,
  cap: SCENE.cap,
  bag: SCENE.cap,
};

export interface RunnerPose {
  jumping: boolean;
  rolling: boolean;
  rollT: number;
  crashed: boolean;
  crashT: number;
  idle: boolean;
  flying: boolean;
  carpet: boolean;
  stumble: number;
  /** -1..1 lean while changing lane. */
  lean: number;
}

/** Low-poly runner facing -Z. Built from primitives so it needs no asset loading. */
export class Runner {
  group = new THREE.Group();
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private head = new THREE.Group();
  private shieldBubble: THREE.Mesh;
  private wings: THREE.Group;
  private carpet: THREE.Group;
  private carpetCloth: THREE.Mesh;
  private hairStyles: Record<RunnerLook["hairStyle"], THREE.Object3D>;
  private capParts: THREE.Object3D[] = [];
  private mats = {
    skin: new THREE.MeshLambertMaterial(),
    jacket: new THREE.MeshLambertMaterial(),
    trim: new THREE.MeshLambertMaterial(),
    pants: new THREE.MeshLambertMaterial(),
    shoes: new THREE.MeshLambertMaterial(),
    cap: new THREE.MeshLambertMaterial(),
    hair: new THREE.MeshLambertMaterial(),
    bag: new THREE.MeshLambertMaterial(),
    sole: new THREE.MeshLambertMaterial({ color: 0x2a2626 }),
    eye: new THREE.MeshLambertMaterial({ color: 0x1b1b1b }),
  };

  constructor(f: ObjectFactory, look: RunnerLook = DEFAULT_LOOK) {
    const m = this.mats;
    const b = this.body;
    // Torso: jacket with zip stripe and collar, belt line.
    b.add(f.part(m.jacket, 0.56, 0.6, 0.32, 0, 0.78));
    b.add(f.part(m.trim, 0.1, 0.6, 0.33, 0, 0.78));
    b.add(f.part(m.trim, 0.58, 0.08, 0.34, 0, 1.34));
    b.add(f.part(m.pants, 0.5, 0.18, 0.3, 0, 0.66));

    // Head group: face, eyes, hair styles and cap.
    const h = this.head;
    h.position.set(0, 1.62, 0);
    // Blocky toy style (as in the app icon): cube head, box hair, box cap.
    h.add(f.part(m.skin, 0.44, 0.44, 0.42, 0, -0.22));
    for (const x of [-0.09, 0.09]) h.add(f.part(m.eye, 0.06, 0.07, 0.02, x, -0.02, -0.215));
    h.add(f.part(m.skin, 0.16, 0.12, 0.16, 0, -0.32));
    const short = new THREE.Group();
    short.add(f.part(m.hair, 0.46, 0.1, 0.44, 0, 0.18), f.part(m.hair, 0.46, 0.26, 0.08, 0, -0.06, 0.2));
    const long = new THREE.Group();
    long.add(f.part(m.hair, 0.47, 0.12, 0.45, 0, 0.17), f.part(m.hair, 0.47, 0.56, 0.1, 0, -0.36, 0.2));
    const bun = new THREE.Group();
    bun.add(f.part(m.hair, 0.46, 0.11, 0.44, 0, 0.18), f.part(m.hair, 0.46, 0.26, 0.08, 0, -0.06, 0.2), f.part(m.hair, 0.2, 0.18, 0.2, 0, 0.24, 0.12));
    const curly = new THREE.Group();
    curly.add(f.part(m.hair, 0.52, 0.16, 0.5, 0, 0.16), f.part(m.hair, 0.52, 0.3, 0.12, 0, -0.1, 0.2));
    this.hairStyles = { short, long, bun, curly };
    h.add(short, long, bun, curly);
    const capTop = f.part(m.cap, 0.48, 0.16, 0.46, 0, 0.2);
    const visor = f.part(m.cap, 0.4, 0.05, 0.24, 0, 0.2, -0.32);
    h.add(capTop, visor);
    this.capParts = [capTop, visor];
    b.add(h);

    const limb = (pivot: THREE.Group, x: number, y: number, w: number, hgt: number, mat: THREE.Material, foot: boolean) => {
      pivot.position.set(x, y, 0);
      pivot.add(f.part(mat, w, hgt, w + 0.04, 0, -hgt));
      if (foot) {
        pivot.add(f.part(m.shoes, w + 0.03, 0.12, 0.36, 0, -hgt - 0.02, -0.07));
        pivot.add(f.part(m.sole, w + 0.04, 0.04, 0.37, 0, -hgt - 0.04, -0.07));
      } else {
        pivot.add(f.part(m.trim, w + 0.02, 0.06, w + 0.06, 0, -hgt + 0.02));
        pivot.add(f.part(m.skin, 0.15, 0.15, 0.15, 0, -hgt - 0.13));
      }
      b.add(pivot);
    };
    limb(this.legL, -0.15, 0.72, 0.2, 0.62, m.pants, true);
    limb(this.legR, 0.15, 0.72, 0.2, 0.62, m.pants, true);
    limb(this.armL, -0.37, 1.3, 0.15, 0.55, m.jacket, false);
    limb(this.armR, 0.37, 1.3, 0.15, 0.55, m.jacket, false);

    // Backpack with straps.
    b.add(f.part(m.bag, 0.4, 0.42, 0.18, 0, 0.9, 0.24));
    b.add(f.part(m.trim, 0.36, 0.08, 0.2, 0, 1.22, 0.24));
    b.add(f.part(m.trim, 0.08, 0.5, 0.06, -0.16, 0.86, 0.17));
    b.add(f.part(m.trim, 0.08, 0.5, 0.06, 0.16, 0.86, 0.17));

    // Seagull-feather wings (Martı Kanadı power-up).
    const feather = new THREE.MeshLambertMaterial({ color: 0xf4f4f0, emissive: 0x333333 });
    const featherTip = new THREE.MeshLambertMaterial({ color: 0x8d9196 });
    this.wings = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(s * 0.2, 1.15, 0.2);
      w.add(f.part(feather, 0.9, 0.05, 0.42, s * 0.45, 0));
      w.add(f.part(feather, 0.6, 0.05, 0.3, s * 1.0, 0.0, 0.05));
      w.add(f.part(featherTip, 0.3, 0.055, 0.26, s * 1.35, 0.0, 0.07));
      w.rotation.z = s * 0.25;
      this.wings.add(w);
    }
    this.wings.visible = false;
    b.add(this.wings);

    // Flying carpet (Uçan Halı power-up), stays level under the runner.
    this.carpet = new THREE.Group();
    this.carpetCloth = f.part(new THREE.MeshLambertMaterial({ color: 0xb5262e }), 1.2, 0.06, 1.8, 0, 0);
    this.carpet.add(this.carpetCloth);
    this.carpet.add(f.part(new THREE.MeshLambertMaterial({ color: 0xe2b04a, emissive: 0x3a2400 }), 0.8, 0.07, 1.3, 0, 0.005));
    const tassel = new THREE.MeshLambertMaterial({ color: 0xe2b04a });
    for (const z of [-0.95, 0.95]) for (let i = 0; i < 4; i++) this.carpet.add(f.part(tassel, 0.05, 0.03, 0.12, -0.45 + i * 0.3, 0.01, z));
    this.carpet.visible = false;

    this.shieldBubble = new THREE.Mesh(
      f.sphere,
      new THREE.MeshLambertMaterial({ color: SCENE.shieldBubble, transparent: true, opacity: 0.3, emissive: 0x1a6f84, depthWrite: false }),
    );
    this.shieldBubble.scale.set(0.9, 1.1, 0.9);
    this.shieldBubble.position.y = 0.95;
    this.shieldBubble.visible = false;

    b.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = true;
    });
    this.carpet.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = true;
    });
    this.group.add(b, this.carpet, this.shieldBubble);
    this.setLook(look);
  }

  setLook(look: RunnerLook) {
    const m = this.mats;
    m.skin.color.set(look.skin);
    m.hair.color.set(look.hair);
    m.jacket.color.set(look.jacket);
    m.trim.color.set(look.jacketTrim);
    m.pants.color.set(look.pants);
    m.shoes.color.set(look.shoes);
    m.bag.color.set(look.bag);
    if (look.cap !== null) m.cap.color.set(look.cap);
    for (const p of this.capParts) p.visible = look.cap !== null;
    for (const [style, obj] of Object.entries(this.hairStyles)) obj.visible = style === look.hairStyle;
    // A cap hides most of short hair; long hair and buns still show below it.
    if (look.cap !== null && look.hairStyle === "curly") this.hairStyles.curly.visible = false;
  }

  setShield(on: boolean) {
    this.shieldBubble.visible = on;
  }

  animate(t: number, speedFactor: number, s: RunnerPose) {
    const b = this.body;
    this.wings.visible = s.flying && !s.crashed;
    this.carpet.visible = s.carpet && !s.crashed;
    b.rotation.z = 0;
    b.rotation.y = 0;
    this.head.rotation.set(0, 0, 0);
    if (s.crashed) {
      const k = Math.min(1, s.crashT / 0.5);
      b.rotation.x = k * 1.35;
      b.position.y = -k * 0.1;
      b.scale.set(1, 1, 1);
      return;
    }
    b.scale.set(1, 1, 1);
    if (s.idle) {
      const ph = t * 2;
      b.position.y = Math.sin(ph) * 0.02;
      b.rotation.x = 0;
      this.head.rotation.y = Math.sin(t * 0.7) * 0.25;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
      this.armL.rotation.z = 0.12 + Math.sin(ph) * 0.03;
      this.armR.rotation.z = -0.12 - Math.sin(ph) * 0.03;
      return;
    }
    const ph = t * 9 * speedFactor;
    b.rotation.z = -s.lean * 0.18;
    if (s.flying) {
      // Arms out, legs trailing, wings flapping.
      b.rotation.x = -0.5;
      b.position.y = Math.sin(t * 3) * 0.06;
      this.legL.rotation.x = 0.4 + Math.sin(t * 4) * 0.1;
      this.legR.rotation.x = 0.5 - Math.sin(t * 4) * 0.1;
      this.armL.rotation.set(0, 0, 1.2);
      this.armR.rotation.set(0, 0, -1.2);
      const flap = Math.sin(t * 9) * 0.35;
      this.wings.children[0].rotation.z = -0.25 - flap;
      this.wings.children[1].rotation.z = 0.25 + flap;
      return;
    }
    this.armL.rotation.z = 0.1;
    this.armR.rotation.z = -0.1;
    if (s.carpet) {
      // Kneeling surfer pose on the carpet; the cloth ripples.
      b.rotation.x = -0.05;
      b.position.y = -0.25 + Math.sin(t * 2.4) * 0.03;
      this.legL.rotation.x = -1.2;
      this.legR.rotation.x = 0.6;
      this.armL.rotation.x = -0.6;
      this.armR.rotation.x = -0.6;
      this.armL.rotation.z = 0.7;
      this.armR.rotation.z = -0.7;
      this.carpet.rotation.x = Math.sin(t * 3) * 0.04;
      this.carpet.rotation.z = Math.sin(t * 2.2) * 0.05 + s.lean * 0.15;
      this.carpetCloth.scale.y = 0.06;
      return;
    }
    if (s.rolling) {
      const k = s.rollT;
      b.scale.set(1, 0.5, 1);
      b.rotation.x = -0.6 + Math.sin(k * Math.PI) * 0.4;
      b.position.y = 0;
      this.legL.rotation.x = this.legR.rotation.x = 1.2;
      this.armL.rotation.x = this.armR.rotation.x = -1.5;
      return;
    }
    if (s.jumping) {
      b.rotation.x = -0.1;
      b.position.y = 0;
      this.legL.rotation.x = 0.9;
      this.legR.rotation.x = -0.3;
      this.armL.rotation.x = -2.4;
      this.armR.rotation.x = -2.4;
      return;
    }
    // Run cycle; a stumble adds a wobble and a look back over the shoulder.
    const wobble = s.stumble > 0 ? Math.sin(t * 14) * 0.08 * Math.min(1, s.stumble) : 0;
    b.rotation.x = -0.14 + wobble;
    b.position.y = Math.abs(Math.sin(ph)) * 0.06;
    if (s.stumble > 0) this.head.rotation.y = Math.sin(t * 2) > 0.6 ? 0.9 : 0;
    this.legL.rotation.x = Math.sin(ph) * 0.95;
    this.legR.rotation.x = -Math.sin(ph) * 0.95;
    this.armL.rotation.x = -Math.sin(ph) * 0.85 - 0.3;
    this.armR.rotation.x = Math.sin(ph) * 0.85 - 0.3;
  }
}
