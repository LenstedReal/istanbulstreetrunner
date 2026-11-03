// Builds every 3D object with the real three.js (no GPU needed): all obstacles,
// pick-ups, the seagull, each runner look and every district street, then bakes
// them. Runs in CI after `npm ci`; skipped where three is not installed.
import assert from "node:assert/strict";
import { test } from "node:test";

let THREE: typeof import("three") | null = null;
try {
  THREE = await import("three");
} catch {
  THREE = null;
}
const skip = THREE ? false : "three is not installed here (runs in CI)";

test("every obstacle, pick-up and the seagull build into few draw calls", { skip }, async () => {
  const { ObjectFactory } = await import("@/src/game/objects");
  const { OBSTACLES } = await import("@/src/game/districts");
  const f = new ObjectFactory();
  for (const kind of Object.keys(OBSTACLES) as (keyof typeof OBSTACLES)[]) {
    const g = f.makeObstacle(kind);
    const meshes = g.children.filter((c) => (c as import("three").Mesh).isMesh);
    assert.ok(meshes.length >= 1 && meshes.length <= 4, `${kind}: ${meshes.length} meshes`);
    const box = new THREE!.Box3().setFromObject(g);
    assert.ok(box.max.y > 0.3 && Number.isFinite(box.max.x), `${kind} has a size`);
    const again = f.makeObstacle(kind);
    assert.equal((again.children[0] as import("three").Mesh).geometry, (meshes[0] as import("three").Mesh).geometry, `${kind} shares geometry`);
  }
  for (const k of ["magnet", "x2", "shield", "wings", "carpet"] as const) assert.ok(f.makePowerup(k).children.length > 0, k);
  assert.ok(f.makeKey().children.length > 0);
  assert.ok(f.makeToken().children.length > 0);
  const gull = f.makeSeagull();
  assert.ok(gull.group.children.length >= 3);
  const coin = f.makeCoinGeometry();
  assert.ok(coin.geometry.getAttribute("color"));
});

test("collision boxes roughly match the visible models", { skip }, async () => {
  const { ObjectFactory } = await import("@/src/game/objects");
  const { OBSTACLES } = await import("@/src/game/districts");
  const f = new ObjectFactory();
  for (const spec of Object.values(OBSTACLES)) {
    const box = new THREE!.Box3().setFromObject(f.makeObstacle(spec.kind));
    // The hit box may be smaller than the model (fair near misses) but never much bigger.
    assert.ok(spec.halfW <= (box.max.x - box.min.x) / 2 + 0.25, `${spec.kind} width`);
    assert.ok(spec.yMax <= box.max.y + 0.25, `${spec.kind} height`);
    if (spec.passage === "high") assert.ok(box.min.y < spec.yMin + 0.1 || spec.yMin >= 1.2, `${spec.kind} overhead`);
  }
});

test("runner builds with every wardrobe look", { skip }, async () => {
  const { ObjectFactory } = await import("@/src/game/objects");
  const { Runner } = await import("@/src/game/runner");
  const { CATALOG, lookOf, parseWardrobe } = await import("@/src/wardrobe");
  const f = new ObjectFactory();
  const r = new Runner(f);
  for (const item of CATALOG.filter((i) => i.kind === "runner")) {
    r.setLook(lookOf({ ...parseWardrobe(null), owned: [item.id], runner: item.id }));
    for (const pose of [{ idle: true }, { flying: true }, { carpet: true }, { rolling: true, rollT: 0.5 }, { jumping: true }, { stumble: 3 }, { crashed: true, crashT: 0.3 }]) {
      r.animate(1.2, 1.5, { jumping: false, rolling: false, rollT: 0, crashed: false, crashT: 0, idle: false, flying: false, carpet: false, stumble: 0, lean: 0.3, ...pose });
    }
  }
});

test("the street builds and bakes in every district at every detail level", { skip }, async () => {
  const { ObjectFactory } = await import("@/src/game/objects");
  const { CityWorld } = await import("@/src/game/world");
  const { DISTRICT_ORDER } = await import("@/src/game/districts");
  const scene = new THREE!.Scene();
  for (const detail of [0, 1, 2] as const) {
    const world = new CityWorld(scene, new ObjectFactory(), { detail, anisotropy: 1, viewDistance: 150 });
    for (const id of DISTRICT_ORDER) {
      world.setDistrict(id);
      world.reset();
      for (let z = 0; z > -400; z -= 25) world.update(z);
      let meshes = 0;
      world.group.traverse((o) => {
        if ((o as import("three").Mesh).isMesh) meshes++;
      });
      // 8 chunks: baked parts + instanced dashes, bollards and windows.
      assert.ok(meshes > 8 && meshes < 8 * 16, `${id}/${detail}: ${meshes} meshes`);
    }
    world.dispose();
  }
});

test("bakeGroup keeps vertex counts and colours", { skip }, async () => {
  const { bakeGroup } = await import("@/src/game/merge");
  const T = THREE!;
  const g = new T.Group();
  const red = new T.MeshLambertMaterial({ color: 0xff0000 });
  const blue = new T.MeshLambertMaterial({ color: 0x0000ff });
  const glow = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffff00 });
  const box = new T.BoxGeometry(1, 1, 1);
  const a = new T.Mesh(box, red);
  a.position.x = 2;
  const b = new T.Mesh(box, blue);
  b.scale.set(2, 2, 2);
  const c = new T.Mesh(box, glow);
  const hidden = new T.Mesh(box, red);
  hidden.visible = false;
  g.add(a, b, c, hidden);
  const { parts, kept } = bakeGroup(g, new Map());
  assert.equal(kept.length, 0);
  assert.equal(parts.length, 2, "plain and emissive buckets");
  const plain = parts.find((p) => p.geometry.getAttribute("position").count === 72)!;
  assert.ok(plain, "two boxes of 36 vertices");
  plain.geometry.computeBoundingBox();
  assert.ok(Math.abs(plain.geometry.boundingBox!.max.x - 2.5) < 1e-6);
  const col = plain.geometry.getAttribute("color");
  const colours = new Set<string>();
  for (let i = 0; i < col.count; i++) colours.add(`${col.getX(i).toFixed(2)},${col.getZ(i).toFixed(2)}`);
  assert.equal(colours.size, 2);
});
