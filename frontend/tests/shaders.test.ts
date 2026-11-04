import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// three.js puts its own GLSL in front of every ShaderMaterial (tone mapping, colour
// space, luminance). A post shader that defines one of these names again does not
// compile, and the game shows only the clear colour. Source-level guard.
const INJECTED = [
  "RRTAndODTFit", "ACESFilmicToneMapping", "LinearToneMapping", "ReinhardToneMapping", "CineonToneMapping",
  "AgXToneMapping", "NeutralToneMapping", "CustomToneMapping", "toneMapping", "toneMappingExposure",
  "luminance", "saturate", "sRGBTransferOETF", "sRGBTransferEOTF", "LinearTransferOETF", "linearToOutputTexel", "LinearToLinear",
];

const source = readFileSync(new URL("../src/game/render/pipeline.ts", import.meta.url), "utf8");
const shaders = [...source.matchAll(/const (\w+) = \/\* glsl \*\/ `([\s\S]*?)`;/g)].map((m) => ({ name: m[1], glsl: m[2] }));

test("the post shaders exist and each carries the pipeline marker", () => {
  assert.deepEqual(shaders.map((s) => s.name).sort(), ["BLUR_FRAG", "BRIGHT_FRAG", "FINAL_FRAG", "FULLSCREEN_VERT"]);
  for (const s of shaders) assert.ok(s.glsl.includes("ist-post"), `${s.name} lacks the marker`);
});

test("post shaders never define a function or uniform that three.js injects", () => {
  for (const s of shaders) {
    for (const name of INJECTED) {
      const defines = new RegExp(`(?:^|\\n)\\s*(?:vec[234]|float|uniform float|#define)\\s+${name}\\b`);
      assert.ok(!defines.test(s.glsl), `${s.name} defines ${name}`);
    }
  }
});

test("every post material is created with toneMapped: false", () => {
  const materials = source.match(/new THREE\.ShaderMaterial\(\{[\s\S]*?\}\);/g) ?? [];
  assert.equal(materials.length, 3);
  for (const m of materials) assert.ok(m.includes("toneMapped: false"), m.slice(0, 80));
});
