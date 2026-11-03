// Istanbul districts: look, light, architecture and obstacle pool. Pure data (no
// three.js) so it can be unit-tested and shared by the UI, the world builder and
// the pattern library.
import type { StringKey } from "@/src/i18n/tr";

export type DistrictId = "istiklal" | "galata" | "eminonu" | "bridge" | "bosphorus";

export const DISTRICT_ORDER: DistrictId[] = ["istiklal", "galata", "eminonu", "bridge", "bosphorus"];

export type ObstacleKind =
  | "tram" | "cart" | "barrier" | "sign" | "pillar" | "icecream"
  | "cat" | "fishcrates" | "flowercart"
  | "pigeons" | "porter" | "tray"
  | "lines" | "buckets" | "bus"
  | "kumpir" | "scooter" | "bench";

/** How an obstacle is passed. "block" = change lane, "low" = jump, "high" = roll under. */
export type Passage = "block" | "low" | "high";

export interface ObstacleSpec {
  kind: ObstacleKind;
  passage: Passage;
  halfW: number;
  yMin: number;
  yMax: number;
  halfD: number;
  /** Moves toward the runner (m/s) or across lanes. */
  motion?: "oncoming" | "crossing" | "rising";
  speed?: number;
  hint: StringKey;
}

export const OBSTACLES: Record<ObstacleKind, ObstacleSpec> = {
  tram: { kind: "tram", passage: "block", halfW: 0.9, yMin: 0, yMax: 3.0, halfD: 3.4, motion: "oncoming", speed: 4, hint: "hint.tram" },
  cart: { kind: "cart", passage: "low", halfW: 0.72, yMin: 0, yMax: 0.95, halfD: 0.5, hint: "hint.cart" },
  barrier: { kind: "barrier", passage: "low", halfW: 0.8, yMin: 0, yMax: 0.9, halfD: 0.18, hint: "hint.barrier" },
  sign: { kind: "sign", passage: "high", halfW: 0.9, yMin: 1.3, yMax: 2.1, halfD: 0.15, hint: "hint.sign" },
  pillar: { kind: "pillar", passage: "block", halfW: 0.42, yMin: 0, yMax: 3.4, halfD: 0.42, hint: "hint.pillar" },
  icecream: { kind: "icecream", passage: "block", halfW: 0.8, yMin: 0, yMax: 2.6, halfD: 0.55, hint: "hint.icecream" },
  cat: { kind: "cat", passage: "low", halfW: 0.3, yMin: 0, yMax: 0.55, halfD: 0.3, motion: "crossing", speed: 1.4, hint: "hint.cat" },
  fishcrates: { kind: "fishcrates", passage: "low", halfW: 0.8, yMin: 0, yMax: 0.85, halfD: 0.45, hint: "hint.fishcrates" },
  flowercart: { kind: "flowercart", passage: "block", halfW: 0.85, yMin: 0, yMax: 1.9, halfD: 0.8, hint: "hint.flowercart" },
  pigeons: { kind: "pigeons", passage: "high", halfW: 0.95, yMin: 1.25, yMax: 2.4, halfD: 0.5, motion: "rising", hint: "hint.pigeons" },
  porter: { kind: "porter", passage: "block", halfW: 0.55, yMin: 0, yMax: 2.5, halfD: 0.5, hint: "hint.porter" },
  tray: { kind: "tray", passage: "low", halfW: 0.75, yMin: 0, yMax: 0.8, halfD: 0.45, hint: "hint.tray" },
  lines: { kind: "lines", passage: "high", halfW: 1.0, yMin: 1.2, yMax: 2.6, halfD: 0.1, hint: "hint.lines" },
  buckets: { kind: "buckets", passage: "low", halfW: 0.7, yMin: 0, yMax: 0.7, halfD: 0.35, hint: "hint.buckets" },
  bus: { kind: "bus", passage: "block", halfW: 0.95, yMin: 0, yMax: 3.1, halfD: 4.6, motion: "oncoming", speed: 5, hint: "hint.bus" },
  kumpir: { kind: "kumpir", passage: "block", halfW: 0.85, yMin: 0, yMax: 2.4, halfD: 0.7, hint: "hint.kumpir" },
  scooter: { kind: "scooter", passage: "low", halfW: 0.35, yMin: 0, yMax: 0.95, halfD: 0.6, motion: "oncoming", speed: 3, hint: "hint.scooter" },
  bench: { kind: "bench", passage: "low", halfW: 0.85, yMin: 0, yMax: 0.85, halfD: 0.35, hint: "hint.bench" },
};

export type StreetKind = "cobble" | "asphalt" | "bridge" | "promenade";
export type SideKind = "buildings" | "sea" | "railing";
export type Backdrop = "galata" | "mosque" | "golden_horn" | "bosphorus";

export interface DistrictDef {
  id: DistrictId;
  name: StringKey;
  obstacles: ObstacleKind[];
  sky: number;
  haze: number;
  fog: number;
  ground: number;
  street: StreetKind;
  /** Tram rails and catenary wires in the middle lane. */
  rails: boolean;
  left: SideKind;
  right: SideKind;
  buildingColors: number[];
  awningColors: number[];
  sun: { color: number; intensity: number; dir: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  exposure: number;
  floors: [number, number];
  balconyChance: number;
  cumbaChance: number;
  domeChance: number;
  shopChance: number;
  trees: "plane" | "palm" | "none";
  backdrop: Backdrop;
}

export const DISTRICTS: Record<DistrictId, DistrictDef> = {
  istiklal: {
    id: "istiklal", name: "district.istiklal",
    obstacles: ["tram", "cart", "barrier", "sign", "pillar", "icecream"],
    sky: 0x3f93c9, haze: 0xf6dfc0, fog: 0xf0d8bd, ground: 0x8f8678, street: "cobble", rails: true, left: "buildings", right: "buildings",
    buildingColors: [0xe9d5b8, 0xd9a37a, 0xc97b5a, 0xf2e4d0, 0xa9bcc9, 0xb98b6e, 0xe0c7a2, 0x8fa6b2, 0xd7b27a, 0xcfa78a],
    awningColors: [0xc8372d, 0x2a7f62, 0x2d6a9f, 0xd9a441],
    sun: { color: 0xfff1d6, intensity: 2.2, dir: [26, 30, -6] }, hemi: { sky: 0xd6ecff, ground: 0x9a8468, intensity: 0.9 }, exposure: 1.05,
    floors: [3, 7], balconyChance: 0.6, cumbaChance: 0.15, domeChance: 0.12, shopChance: 0.9, trees: "plane", backdrop: "galata",
  },
  galata: {
    id: "galata", name: "district.galata",
    obstacles: ["cart", "barrier", "sign", "cat", "fishcrates", "flowercart"],
    sky: 0x4a8fc4, haze: 0xf3d9c2, fog: 0xeed4bd, ground: 0x857a6c, street: "cobble", rails: false, left: "buildings", right: "buildings",
    buildingColors: [0xd9b38c, 0xb5654a, 0xe7cfa8, 0x9fb0a8, 0xc98d64, 0xf0dcc0, 0x7d8f99, 0xcc9c6a],
    awningColors: [0x8c2f39, 0x2f6f73, 0xc7862f],
    sun: { color: 0xffe2b8, intensity: 2.0, dir: [-24, 26, -10] }, hemi: { sky: 0xd9e8ff, ground: 0x8d7558, intensity: 0.85 }, exposure: 1.08,
    floors: [3, 6], balconyChance: 0.5, cumbaChance: 0.35, domeChance: 0.05, shopChance: 0.7, trees: "plane", backdrop: "galata",
  },
  eminonu: {
    id: "eminonu", name: "district.eminonu",
    obstacles: ["cart", "barrier", "pigeons", "porter", "tray", "sign"],
    sky: 0x5a9bd0, haze: 0xf5e4c8, fog: 0xf1dcc0, ground: 0x93887a, street: "cobble", rails: false, left: "buildings", right: "buildings",
    buildingColors: [0xe2c9a0, 0xcaa77a, 0xb88f6a, 0xd8c3a5, 0xa38b72, 0xeadbc2],
    awningColors: [0xb33a2e, 0x2b5f8a, 0xd08a2c, 0x3d7a4a],
    sun: { color: 0xfff4dc, intensity: 2.3, dir: [20, 34, -4] }, hemi: { sky: 0xe0efff, ground: 0x9b876c, intensity: 0.95 }, exposure: 1.02,
    floors: [2, 5], balconyChance: 0.3, cumbaChance: 0.05, domeChance: 0.35, shopChance: 1.0, trees: "none", backdrop: "mosque",
  },
  bridge: {
    id: "bridge", name: "district.bridge",
    obstacles: ["lines", "buckets", "bus", "barrier", "scooter"],
    sky: 0x6aa6d6, haze: 0xf6e2cc, fog: 0xe9dccb, ground: 0x3c6e8f, street: "bridge", rails: true, left: "railing", right: "railing",
    buildingColors: [0xd8c8b0],
    awningColors: [0x2d6a9f],
    sun: { color: 0xffe6c4, intensity: 2.1, dir: [30, 22, -14] }, hemi: { sky: 0xd8ecff, ground: 0x4e7590, intensity: 1.0 }, exposure: 1.06,
    floors: [0, 0], balconyChance: 0, cumbaChance: 0, domeChance: 0, shopChance: 0, trees: "none", backdrop: "golden_horn",
  },
  bosphorus: {
    id: "bosphorus", name: "district.bosphorus",
    obstacles: ["kumpir", "scooter", "bench", "barrier", "cat", "sign"],
    sky: 0x2f7fc0, haze: 0xffd9b0, fog: 0xf6d2ad, ground: 0x2e6688, street: "promenade", rails: false, left: "buildings", right: "sea",
    buildingColors: [0xf3e6d3, 0xe8d2b8, 0xc9d6dc, 0xf0c9a8, 0xd9c2a0],
    awningColors: [0x2d6a9f, 0xc8372d, 0x3c8c6e],
    sun: { color: 0xffd6a0, intensity: 2.0, dir: [-30, 18, -20] }, hemi: { sky: 0xffe2c6, ground: 0x3f6f8c, intensity: 0.95 }, exposure: 1.1,
    floors: [2, 4], balconyChance: 0.55, cumbaChance: 0.25, domeChance: 0.1, shopChance: 0.5, trees: "palm", backdrop: "bosphorus",
  },
};

export function isDistrict(v: unknown): v is DistrictId {
  return typeof v === "string" && (DISTRICT_ORDER as string[]).includes(v);
}

export function nextDistrict(id: DistrictId): DistrictId | null {
  const i = DISTRICT_ORDER.indexOf(id);
  return i >= 0 && i < DISTRICT_ORDER.length - 1 ? DISTRICT_ORDER[i + 1] : null;
}
