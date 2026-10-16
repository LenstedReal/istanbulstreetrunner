import * as THREE from "three";

/** Small procedural textures (no asset files) that break up flat Lambert surfaces. */

function makeTexture(size: number, fill: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Deterministic hash noise so textures are identical across runs.
function hash(x: number, y: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, scale: number, seed = 0) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const gray = (v: number): [number, number, number] => {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return [c, c, c];
};

export function asphaltTexture() {
  return makeTexture(128, (x, y) => {
    const n = smoothNoise(x, y, 9, 1) * 0.5 + smoothNoise(x, y, 3, 2) * 0.3 + hash(x, y, 3) * 0.2;
    const crack = smoothNoise(x, y, 23, 4) > 0.78 ? -25 : 0;
    return gray(150 + n * 90 + crack);
  });
}

export function cobbleTexture() {
  return makeTexture(128, (x, y) => {
    const cell = 16;
    const row = Math.floor(y / cell);
    const ox = row % 2 ? cell / 2 : 0;
    const cx = ((x + ox) % cell) / cell - 0.5;
    const cy = (y % cell) / cell - 0.5;
    const r = Math.sqrt(cx * cx + cy * cy);
    const edge = r > 0.42 ? -70 : 0;
    const shade = hash(Math.floor((x + ox) / cell), row, 5) * 50;
    return gray(140 + shade + edge + hash(x, y, 6) * 20);
  });
}

export function sidewalkTexture() {
  return makeTexture(128, (x, y) => {
    const tile = 32;
    const line = x % tile < 2 || y % tile < 2 ? -60 : 0;
    const n = smoothNoise(x, y, 7, 7) * 30 + hash(x, y, 8) * 14;
    return gray(185 + n + line);
  });
}

/** Stucco wall with faint floor bands; tinted per building by material.color. */
export function facadeTexture() {
  return makeTexture(128, (x, y) => {
    const n = smoothNoise(x, y, 11, 9) * 40 + hash(x, y, 10) * 18;
    const band = y % 32 < 3 ? -28 : 0;
    const stain = smoothNoise(x, y, 40, 11) > 0.72 ? -18 : 0;
    return gray(205 + n + band + stain);
  });
}

export function roofTexture() {
  return makeTexture(64, (x, y) => {
    const n = hash(x, y, 12) * 30 + smoothNoise(x, y, 6, 13) * 40;
    return gray(130 + n);
  });
}

export function metalTexture() {
  return makeTexture(64, (x, y) => gray(170 + smoothNoise(x, y, 5, 14) * 50 + (x % 8 === 0 ? -20 : 0)));
}
