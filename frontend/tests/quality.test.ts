import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_GRAPHICS,
  effectiveQuality,
  internalSize,
  parseGraphics,
  pickAutoQuality,
  PROFILES,
  QUALITY_ORDER,
  resolveProfile,
  SAFE_CAPS,
} from "@/src/game/quality/profiles";
import { FpsMeter, initialScale, updateScale } from "@/src/game/quality/scale";

test("profiles get lighter from ultra to verylow", () => {
  const ids = [...QUALITY_ORDER];
  for (let i = 1; i < ids.length; i++) {
    const lo = PROFILES[ids[i - 1]];
    const hi = PROFILES[ids[i]];
    assert.ok(lo.shortSide <= hi.shortSide, `${lo.id} <= ${hi.id}`);
    assert.ok(lo.viewDistance <= hi.viewDistance);
    assert.ok(lo.shadowMap <= hi.shadowMap);
  }
  assert.equal(PROFILES.high.msaa, 0);
});

test("settings parse safely and old shadow preference survives", () => {
  assert.deepEqual(parseGraphics(null), DEFAULT_GRAPHICS);
  assert.deepEqual(parseGraphics("{bad"), DEFAULT_GRAPHICS);
  const g = parseGraphics(JSON.stringify({ quality: "ultra", fps: 30, shadows: false, unsafe: ["ultra", "x"] }));
  assert.equal(g.quality, "ultra");
  assert.equal(g.fps, 30);
  assert.equal(g.shadows, false);
  assert.deepEqual(g.unsafe, ["ultra"]);
  assert.equal(effectiveQuality(g), "high");
});

test("auto quality: benchmark result, medium before it", () => {
  assert.equal(effectiveQuality(DEFAULT_GRAPHICS), "medium");
  assert.equal(pickAutoQuality(60), "high");
  assert.equal(pickAutoQuality(50), "medium");
  assert.equal(pickAutoQuality(40), "low");
  assert.equal(pickAutoQuality(20), "verylow");
  assert.equal(effectiveQuality({ ...DEFAULT_GRAPHICS, autoResolved: "low" }), "low");
});

test("device limits switch off features the GPU cannot do", () => {
  const noRt = resolveProfile({ ...DEFAULT_GRAPHICS, quality: "ultra" }, SAFE_CAPS);
  assert.equal(noRt.post, "none");
  assert.equal(noRt.shadowMap, 0);
  const noHalf = resolveProfile({ ...DEFAULT_GRAPHICS, quality: "high" }, { ...SAFE_CAPS, renderTarget: true });
  assert.equal(noHalf.bloomScale, 0);
  assert.equal(noHalf.post, "grade");
  const full = resolveProfile({ ...DEFAULT_GRAPHICS, quality: "ultra" }, { renderTarget: true, halfFloat: true, maxSamples: 2, maxTextureSize: 4096, maxAnisotropy: 4 });
  assert.equal(full.msaa, 2);
  assert.equal(full.anisotropy, 4);
  const off = resolveProfile({ ...DEFAULT_GRAPHICS, quality: "high", shadows: false }, { ...SAFE_CAPS, renderTarget: true, halfFloat: true });
  assert.equal(off.shadowMap, 0);
});

test("internal resolution caps the short side and respects the floor", () => {
  const s = internalSize(1080, 2400, PROFILES.medium, 1);
  assert.equal(s.w, 720);
  assert.equal(s.h, 1600);
  const small = internalSize(1080, 2400, PROFILES.medium, 0.1);
  assert.equal(small.w, Math.round(720 * PROFILES.medium.minScale));
  const tiny = internalSize(480, 800, PROFILES.ultra, 1);
  assert.equal(tiny.w, 480);
});

test("adaptive scale drops on slow frames and recovers on fast ones", () => {
  let s = initialScale();
  for (let i = 0; i < 200; i++) s = updateScale(s, 33, 60, 0.6);
  assert.ok(s.scale < 1 && s.scale >= 0.6, String(s.scale));
  const low = s.scale;
  for (let i = 0; i < 2000; i++) s = updateScale(s, 12, 60, 0.6);
  assert.ok(s.scale > low);
  assert.ok(s.scale <= 1);
  const m = new FpsMeter();
  for (let i = 0; i < 60; i++) m.add(1 / 60);
  assert.ok(Math.abs(m.fps - 60) < 0.01);
  m.add(5);
  assert.ok(Math.abs(m.fps - 60) < 0.01);
});
