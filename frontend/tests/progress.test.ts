import assert from "node:assert/strict";
import { test } from "node:test";

import { coinBalance, enqueue, mergeSave, parsePending, parseSaveData, PENDING_MAX, PENDING_MAX_AGE_MS, toSaveData } from "@/src/cloudsave";
import { addToken, DEFAULT_PROGRESS, mergeProgress, parseProgress, tokenDistance, tokensMissing } from "@/src/progress";
import { buy, CATALOG, DEFAULT_WARDROBE, equip, lookOf, parseWardrobe } from "@/src/wardrobe";

test("three tokens open the next district, once", () => {
  let p = parseProgress(null);
  assert.equal(tokensMissing(p, "istiklal"), 3);
  assert.equal(tokenDistance(p, "istiklal"), 450);
  let out = addToken(p, "istiklal");
  assert.equal(out.unlocked, null);
  p = addToken(out.progress, "istiklal").progress;
  assert.equal(tokenDistance(p, "istiklal"), 1150);
  out = addToken(p, "istiklal");
  assert.equal(out.unlocked, "galata");
  assert.ok(out.progress.unlocked.includes("galata"));
  assert.equal(tokensMissing(out.progress, "istiklal"), 0);
  assert.equal(tokenDistance(out.progress, "istiklal"), null);
  assert.equal(addToken(out.progress, "istiklal").unlocked, null);
  assert.equal(tokenDistance(DEFAULT_PROGRESS, "bosphorus"), null);
});

test("broken progress data falls back to the first district", () => {
  assert.deepEqual(parseProgress("{nope").unlocked, ["istiklal"]);
  const p = parseProgress(JSON.stringify({ current: "mars", unlocked: ["galata", "x"], tokens: { istiklal: 9 } }));
  assert.deepEqual(p.unlocked, ["istiklal", "galata"]);
  assert.equal(p.current, "istiklal");
  assert.equal(p.tokens.istiklal, 3);
});

test("progress merge never loses an unlocked district", () => {
  const a = parseProgress(JSON.stringify({ current: "galata", unlocked: ["istiklal", "galata"], tokens: { galata: 1 } }));
  const b = parseProgress(JSON.stringify({ unlocked: ["istiklal"], tokens: { istiklal: 3, galata: 2 } }));
  const m = mergeProgress(a, b);
  assert.deepEqual(m.unlocked, ["istiklal", "galata"]);
  assert.equal(m.tokens.galata, 2);
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
