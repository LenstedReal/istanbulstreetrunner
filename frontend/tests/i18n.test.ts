import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { OBSTACLES } from "@/src/game/districts";
import { en } from "@/src/i18n/en";
import { tr } from "@/src/i18n/tr";
import { CATALOG } from "@/src/wardrobe";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

test("Turkish and English have the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(tr).sort());
  for (const k of Object.keys(tr) as (keyof typeof tr)[]) {
    assert.deepEqual(placeholders(en[k]), placeholders(tr[k]), k);
    assert.ok(en[k].trim().length > 0, `empty en ${k}`);
  }
});

test("every key used in code exists", () => {
  const root = join(import.meta.dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) files.push(p);
    }
  };
  walk(join(root, "app"));
  walk(join(root, "src"));
  const keys = new Set(Object.keys(tr));
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z]+\.[\w.]+)"/g)) if (!keys.has(m[1])) missing.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
  for (const o of Object.values(OBSTACLES)) assert.ok(keys.has(o.hint), o.hint);
  for (const i of CATALOG) assert.ok(keys.has(i.section), i.section);
  for (const q of ["ultra", "high", "medium", "low", "verylow"]) assert.ok(keys.has(`settings.quality.${q}`));
});

test("legal texts exist in both languages with the same structure", () => {
  const legal = JSON.parse(readFileSync(join(import.meta.dirname, "..", "src", "legal", "legal.json"), "utf8"));
  for (const doc of ["privacy", "terms", "licenses", "deletion"]) {
    assert.ok(legal[doc].tr.sections.length > 0, doc);
    assert.equal(legal[doc].tr.sections.length, legal[doc].en.sections.length, doc);
  }
  const text = JSON.stringify(legal);
  assert.ok(!/@gmail\.com/i.test(text), "no personal e-mail in public texts");
  assert.ok(text.includes(legal.contact));
});
