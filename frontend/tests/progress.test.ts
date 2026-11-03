import assert from "node:assert/strict";
import { test } from "node:test";

import { coinBalance, enqueue, mergeSave, parsePending, parseSaveData, PENDING_MAX, PENDING_MAX_AGE_MS, toSaveData } from "@/src/cloudsave";
import { DISTRICT_ORDER } from "@/src/game/districts";
import { levelTuning } from "@/src/game/patterns";
import { GOALS, levelOf, mergeProgress, parseProgress, recordLevelRun, topLevel } from "@/src/progress";
import { buy, CATALOG, DEFAULT_WARDROBE, equip, lookOf, parseWardrobe } from "@/src/wardrobe";

test("a district goal in one run opens the next district and moves the player there", () => {
  let p = parseProgress(null);
  assert.equal(levelOf(p.current), 0);
  let out = recordLevelRun(p, "istiklal", 599, 500);
  assert.equal(out.completed, false);
  out = recordLevelRun(out.progress, "istiklal", 2000, 39);
  assert.equal(out.completed, false, "both distance and coins are needed in the same run");
  assert.deepEqual(out.progress.best.istiklal, { distance: 2000, coins: 500 });
  out = recordLevelRun(out.progress, "istiklal", GOALS.istiklal.distance, GOALS.istiklal.coins);
  assert.equal(out.completed, true);
  assert.equal(out.unlocked, "galata");
  assert.equal(out.progress.current, "galata");
  assert.equal(topLevel(out.progress), 1);
  p = out.progress;
  out = recordLevelRun(p, "istiklal", 5000, 500);
  assert.equal(out.completed, false, "a goal counts once");
  assert.equal(out.unlocked, null);
});

test("goals grow with every level and the last level completes without unlocking", () => {
  for (let i = 1; i < DISTRICT_ORDER.length; i++) {
    const a = GOALS[DISTRICT_ORDER[i - 1]];
    const b = GOALS[DISTRICT_ORDER[i]];
    assert.ok(b.distance > a.distance && b.coins > a.coins);
  }
  const all = parseProgress(JSON.stringify({ current: "bosphorus", unlocked: DISTRICT_ORDER }));
  const out = recordLevelRun(all, "bosphorus", 99999, 9999);
  assert.equal(out.completed, true);
  assert.equal(out.unlocked, null);
  assert.equal(out.progress.current, "bosphorus");
});

test("levels speed the game up and pack obstacles tighter", () => {
  const l0 = levelTuning(0);
  const l4 = levelTuning(4);
  assert.ok(l4.startSpeed > l0.startSpeed && l4.startSpeed <= 32);
  assert.ok(l4.distanceOffset > l0.distanceOffset);
  assert.deepEqual(levelTuning(99), l4);
  assert.deepEqual(levelTuning(-3), l0);
});

test("old saves: opened districts count as done; broken data falls back", () => {
  assert.deepEqual(parseProgress("{nope").unlocked, ["istiklal"]);
  const p = parseProgress(JSON.stringify({ current: "mars", unlocked: ["galata", "x"], tokens: { istiklal: 3 } }));
  assert.deepEqual(p.unlocked, ["istiklal", "galata"]);
  assert.deepEqual(p.done, ["istiklal"]);
  assert.equal(p.current, "galata");
});

test("progress merge never loses an opened district or a best run", () => {
  const a = parseProgress(JSON.stringify({ current: "galata", unlocked: ["istiklal", "galata"], best: { galata: { distance: 300, coins: 10 } } }));
  const b = parseProgress(JSON.stringify({ unlocked: ["istiklal"], best: { galata: { distance: 100, coins: 50 } } }));
  const m = mergeProgress(a, b);
  assert.deepEqual(m.unlocked, ["istiklal", "galata"]);
  assert.deepEqual(m.best.galata, { distance: 300, coins: 50 });
  assert.equal(m.current, "galata");
});

test("wardrobe: buy needs coins, equips and keeps defaults owned", () => {
  const w = parseWardrobe(null);
  assert.equal(buy(w, "ece", 100), null);
  const out = buy(w, "ece", 600);
  assert.ok(out);
  assert.equal(out.cost, 600);
  assert.equal(out.wardrobe.runner, "ece");
  assert.equal(buy(out.wardrobe, "ece", 10_000), null);
  const e = equip(out.wardrobe, "jacket-red");
  assert.equal(e.jacket, "jacket-red");
  assert.equal(lookOf(e).jacket, CATALOG.find((i) => i.id === "jacket-red")?.color);
  assert.deepEqual(equip(w, "jacket-tile"), w);
  const bad = parseWardrobe(JSON.stringify({ owned: ["hack"], runner: "hack" }));
  assert.deepEqual(bad.owned, DEFAULT_WARDROBE.owned);
  assert.equal(bad.runner, "deniz");
  assert.equal(new Set(CATALOG.map((i) => i.id)).size, CATALOG.length);
});

test("cloud save merge: fresh phone keeps the max, synced phone takes the server copy", () => {
  const base = { coinsSpent: 100, coinsBonus: 50, progress: parseProgress(null), wardrobe: parseWardrobe(null), best: 900 };
  const local = toSaveData({ ...base, keys: 3 });
  const remote = toSaveData({ ...base, keys: 10, coinsSpent: 300, best: 1200 });
  const fresh = mergeSave(local, remote, false);
  assert.equal(fresh.keys, 10);
  assert.equal(fresh.coinsSpent, 300);
  assert.equal(fresh.best, 1200);
  const synced = mergeSave(toSaveData({ ...base, keys: 30 }), remote, true);
  assert.equal(synced.keys, 10);
  assert.equal(parseSaveData({ v: 2 }), null);
  assert.equal(parseSaveData({ v: 1, keys: -5 })?.keys, 0);
  assert.equal(coinBalance(100, 20, 500), 0);
  assert.equal(coinBalance(1000, 20, 500), 520);
});

test("pending run queue keeps the last five and drops expired runs", () => {
  const now = 10_000_000_000;
  let list = parsePending(null, now);
  for (let i = 0; i < 8; i++) list = enqueue(list, { runId: `r${i}`, at: now, body: { score: i, coins: 0, distance: 0, duration_ms: 0, revives: 0 } });
  assert.equal(list.length, PENDING_MAX);
  assert.equal(list[0].runId, "r3");
  const raw = JSON.stringify([...list, { runId: "old", at: now - PENDING_MAX_AGE_MS - 1, body: {} }]);
  assert.equal(parsePending(raw, now).some((p) => p.runId === "old"), false);
  assert.deepEqual(parsePending("garbage", now), []);
});

test("rating question: after 5 runs, later = 10 more runs, at most 3 times", async () => {
  const { afterRun, DEFAULT_RATE, finish, parseRate, postpone, rateDue } = await import("@/src/rating-logic");
  let s = { ...DEFAULT_RATE };
  for (let i = 0; i < 4; i++) s = afterRun(s);
  assert.equal(rateDue(s), false);
  s = afterRun(s);
  assert.equal(rateDue(s), true);
  s = postpone(s);
  assert.equal(rateDue(s), false);
  for (let i = 0; i < 10; i++) s = afterRun(s);
  assert.equal(rateDue(s), true);
  s = postpone(postpone(s));
  assert.equal(s.done, true);
  assert.equal(rateDue(finish({ ...DEFAULT_RATE, runs: 50 })), false);
  assert.deepEqual(parseRate("bad"), DEFAULT_RATE);
});
