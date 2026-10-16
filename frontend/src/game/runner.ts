import * as THREE from "three";

import { ObjectFactory } from "./objects";
import { SCENE } from "./palette";

/** Low-poly runner facing -Z. Built from boxes so it needs no asset loading. */
export class Runner {
  group = new THREE.Group();
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private shieldBubble: THREE.Mesh;

  constructor(f: ObjectFactory) {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const skin = mat(SCENE.skin);
    const jacket = mat(SCENE.jacket);
    const jacketDark = mat(SCENE.jacketDark);
    const pants = mat(SCENE.pants);
    const shoes = mat(SCENE.shoes);
    const cap = mat(SCENE.cap);
    const hair = mat(SCENE.hair);

    const b = this.body;
    b.add(f.part(jacket, 0.56, 0.6, 0.32, 0, 0.78));
    b.add(f.part(jacketDark, 0.12, 0.6, 0.33, 0, 0.78));
    b.add(f.part(pants, 0.5, 0.18, 0.3, 0, 0.66));
    const head = new THREE.Mesh(f.sphere, skin);
    head.scale.setScalar(0.23);
    head.position.set(0, 1.62, 0);
    b.add(head);
    const hairM = new THREE.Mesh(f.sphere, hair);
    hairM.scale.set(0.2, 0.12, 0.2);
    hairM.position.set(0, 1.74, 0.03);
    b.add(hairM);
    const capM = new THREE.Mesh(f.sphere, cap);
    capM.scale.set(0.245, 0.14, 0.245);
    capM.position.set(0, 1.74, 0);
    b.add(capM);
    b.add(f.part(cap, 0.3, 0.05, 0.24, 0, 1.72, -0.23)); // cap visor points forward (-Z, direction of travel)

    const limb = (pivot: THREE.Group, x: number, y: number, w: number, h: number, m: THREE.Material, foot?: THREE.Material) => {
      pivot.position.set(x, y, 0);
      const seg = f.part(m, w, h, w + 0.04, 0, -h);
      pivot.add(seg);
      // Shoe toe extends forward (-Z)
      if (foot) pivot.add(f.part(foot, w + 0.03, 0.12, 0.36, 0, -h - 0.02, -0.07));
      else {
        const hand = new THREE.Mesh(f.sphere, skin);
        hand.scale.setScalar(0.09);
        hand.position.set(0, -h - 0.04, 0);
        pivot.add(hand);
      }
      b.add(pivot);
    };
    limb(this.legL, -0.15, 0.72, 0.2, 0.62, pants, shoes);
    limb(this.legR, 0.15, 0.72, 0.2, 0.62, pants, shoes);
    limb(this.armL, -0.37, 1.3, 0.15, 0.55, jacket);
    limb(this.armR, 0.37, 1.3, 0.15, 0.55, jacket);

    this.shieldBubble = new THREE.Mesh(
      f.sphere,
      new THREE.MeshLambertMaterial({ color: SCENE.shieldBubble, transparent: true, opacity: 0.3, emissive: 0x1a6f84 }),
    );
    this.shieldBubble.scale.set(0.9, 1.1, 0.9);
    this.shieldBubble.position.y = 0.95;
    this.shieldBubble.visible = false;

    // Backpack
    b.add(f.part(cap, 0.4, 0.42, 0.18, 0, 0.9, 0.24));
    b.add(f.part(jacketDark, 0.08, 0.5, 0.06, -0.16, 0.86, 0.17));
    b.add(f.part(jacketDark, 0.08, 0.5, 0.06, 0.16, 0.86, 0.17));

    b.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = true;
    });
    this.group.add(b, this.shieldBubble);
  }

  setShield(on: boolean) {
    this.shieldBubble.visible = on;
  }

  animate(t: number, speedFactor: number, state: { jumping: boolean; rolling: boolean; rollT: number; crashed: boolean; crashT: number; idle: boolean }) {
    const b = this.body;
    if (state.crashed) {
      const k = Math.min(1, state.crashT / 0.5);
      b.rotation.x = k * 1.35;
      b.position.y = -k * 0.1;
      b.scale.set(1, 1, 1);
      return;
    }
    b.scale.set(1, 1, 1);
    if (state.idle) {
      const ph = t * 2;
      b.position.y = Math.sin(ph) * 0.02;
      b.rotation.x = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
      this.armL.rotation.z = 0.12 + Math.sin(ph) * 0.03;
      this.armR.rotation.z = -0.12 - Math.sin(ph) * 0.03;
      return;
    }
    const ph = t * 9 * speedFactor;
    if (state.rolling) {
      const k = state.rollT;
      b.scale.set(1, 0.5, 1);
      b.rotation.x = -0.6 + Math.sin(k * Math.PI) * 0.4;
      b.position.y = 0;
      this.legL.rotation.x = this.legR.rotation.x = 1.2;
      this.armL.rotation.x = this.armR.rotation.x = -1.5;
      return;
    }
    if (state.jumping) {
      b.rotation.x = -0.1;
      b.position.y = 0;
      this.legL.rotation.x = 0.9;
      this.legR.rotation.x = -0.3;
      this.armL.rotation.x = -2.4;
      this.armR.rotation.x = -2.4;
      return;
    }
    b.rotation.x = -0.14;
    b.position.y = Math.abs(Math.sin(ph)) * 0.06;
    this.legL.rotation.x = Math.sin(ph) * 0.95;
    this.legR.rotation.x = -Math.sin(ph) * 0.95;
    this.armL.rotation.x = -Math.sin(ph) * 0.85 - 0.3;
    this.armR.rotation.x = Math.sin(ph) * 0.85 - 0.3;
    this.armL.rotation.z = 0.1;
    this.armR.rotation.z = -0.1;
  }
}
