import assert from "node:assert/strict";
import { test } from "node:test";

import { DISTRICT_ORDER, DISTRICTS, OBSTACLES, nextDistrict } from "@/src/game/districts";
import { isFair, planRow, poolsFor } from "@/src/game/patterns";
import { createRng } from "@/src/game/rng";
import { plan, skipFrame, STEP } from "@/src/game/timestep";

test("rng is deterministic per seed and stays in range", () => {
  const a = createRng(1234);
  const b = createRng(1234);
  const c = createRng(99);
  const sa = Array.from({ length: 50 }, () => a.next());
  const sb = Array.from({ length: 50 }, () => b.next());
  const sc = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
  const r = createRng(7);
  for (let i = 0; i < 500; i++) {
    const n = r.int(1, 3);
    assert.ok(n >= 1 && n <= 3 && Number.isInteger(n));
  }
});

test("fixed timestep keeps the remainder and drops long stalls", () => {
  let p = plan(0, 1 / 60);
  assert.equal(p.steps, 2);
  assert.ok(Math.abs(p.acc) < 1e-9);
  p = plan(0, 1 / 30);
  assert.equal(p.steps, 4);
  p = plan(STEP / 2, STEP / 2);
  assert.equal(p.steps, 1);
  p = plan(0, 2);
  assert.equal(p.steps, 6);
  assert.equal(p.acc, 0);
  assert.equal(skipFrame(8.3, 60), true); // 120 Hz display, 60 FPS cap: every other refresh
  assert.equal(skipFrame(16.6, 60), false);
  assert.equal(skipFrame(16.6, 30), true);
  assert.equal(skipFrame(33, 30), false);
});

test("every district has obstacles for each passage it uses and valid hints", () => {
  for (const id of DISTRICT_ORDER) {
    const d = DISTRICTS[id];
    assert.ok(d.obstacles.length >= 4, id);
    for (const k of d.obstacles) assert.ok(OBSTACLES[k], `${id}:${k}`);
    const pools = poolsFor(id);
    assert.ok(pools.low.length + pools.block.length + pools.moving.length + pools.high.length === d.obstacles.length, id);
  }
  assert.equal(nextDistrict("bosphorus"), null);
  assert.equal(nextDistrict("istiklal"), "galata");
});

test("the original five obstacles keep their 1.0 collision boxes", () => {
  assert.deepEqual([OBSTACLES.tram.halfW, OBSTACLES.tram.yMax, OBSTACLES.tram.halfD], [0.9, 3.0, 3.4]);
  assert.deepEqual([OBSTACLES.cart.halfW, OBSTACLES.cart.yMax, OBSTACLES.cart.halfD], [0.72, 0.95, 0.5]);
  assert.deepEqual([OBSTACLES.barrier.halfW, OBSTACLES.barrier.yMax, OBSTACLES.barrier.halfD], [0.8, 0.9, 0.18]);
  assert.deepEqual([OBSTACLES.sign.yMin, OBSTACLES.sign.yMax], [1.3, 2.1]);
  assert.deepEqual([OBSTACLES.pillar.halfW, OBSTACLES.pillar.yMax], [0.42, 3.4]);
});

test("high obstacles can be rolled under and low ones jumped", () => {
  const ROLL_TOP = 0.85; // ROLL_H
  const JUMP_PEAK = (9.2 * 9.2) / (2 * 26); // JUMP_VY^2 / 2g
  for (const o of Object.values(OBSTACLES)) {
    if (o.passage === "high") assert.ok(o.yMin + 0.04 >= ROLL_TOP, o.kind);
    if (o.passage === "low") assert.ok(o.yMax - 0.08 < JUMP_PEAK, o.kind);
  }
});

test("10 000 generated rows are all fair in every district", () => {
  for (const id of DISTRICT_ORDER) {
    const rng = createRng(42 + id.length);
    for (let i = 0; i < 2000; i++) {
      const row = planRow(rng, id, (i % 40) * 60);
      assert.ok(isFair(row), `${id} row ${i}: ${JSON.stringify(row)}`);
      for (const o of row.obstacles) assert.ok(DISTRICTS[id].obstacles.includes(o.kind), `${id} uses ${o.kind}`);
    }
  }
});

test("early rows stay simple (as in 1.0): one jump, at most two lane blocks, no mixes", () => {
  const rng = createRng(5);
  for (let i = 0; i < 500; i++) {
    const row = planRow(rng, "istiklal", 100);
    if (row.family === "low" || row.family === "high" || row.family === "moving") assert.equal(row.obstacles.length, 1, JSON.stringify(row));
    else assert.ok(row.obstacles.length <= 2 && row.obstacles.every((o) => o.kind === "pillar" || o.kind === "icecream"), JSON.stringify(row));
  }
});
