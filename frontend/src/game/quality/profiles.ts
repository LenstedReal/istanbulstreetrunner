// Graphics quality profiles. Pure data and functions (no three.js), unit-tested in Node.
//
// Expo GL draws into a buffer the size of the screen in physical pixels, so the
// "internal resolution" here is a cap on the short side of the render target the
// scene is drawn into before it is stretched to the screen.

export type QualityId = "ultra" | "high" | "medium" | "low" | "verylow";
export type QualityPref = QualityId | "auto";
export type FpsLimit = 30 | 60;

export const QUALITY_ORDER: QualityId[] = ["verylow", "low", "medium", "high", "ultra"];

export interface QualityProfile {
  id: QualityId;
  /** Cap for the short side of the internal render target, in pixels. */
  shortSide: number;
  /** Lowest adaptive render scale. */
  minScale: number;
  /** 0 = shadows off. */
  shadowMap: 0 | 1024 | 2048;
  /** "full": MSAA + bloom + grade; "grade": one colour/vignette pass; "none": plain upscale. */
  post: "full" | "grade" | "none";
  /** Multisampling of the scene target. Off on "high": some Expo GL drivers fail to resolve it. */
  msaa: 0 | 2 | 4;
  bloomScale: 0 | 0.25 | 0.5;
  grain: boolean;
  fogStart: number;
  /** Fog end and camera far plane, in metres. */
  viewDistance: number;
  anisotropy: number;
  particles: "full" | "reduced" | "off";
  /** 0: bare buildings, 1: balconies and signs, 2: every prop. */
  detail: 0 | 1 | 2;
  defaultFps: FpsLimit;
}

export const PROFILES: Record<QualityId, QualityProfile> = {
  ultra: {
    id: "ultra", shortSide: 1080, minScale: 0.6, shadowMap: 2048, post: "full", msaa: 4, bloomScale: 0.5, grain: true,
    fogStart: 70, viewDistance: 220, anisotropy: 8, particles: "full", detail: 2, defaultFps: 60,
  },
  high: {
    id: "high", shortSide: 900, minScale: 0.6, shadowMap: 1024, post: "full", msaa: 0, bloomScale: 0.25, grain: false,
    fogStart: 60, viewDistance: 190, anisotropy: 4, particles: "full", detail: 2, defaultFps: 60,
  },
  medium: {
    id: "medium", shortSide: 720, minScale: 0.6, shadowMap: 1024, post: "grade", msaa: 0, bloomScale: 0, grain: false,
    fogStart: 50, viewDistance: 170, anisotropy: 2, particles: "reduced", detail: 1, defaultFps: 60,
  },
  low: {
    id: "low", shortSide: 540, minScale: 0.6, shadowMap: 0, post: "grade", msaa: 0, bloomScale: 0, grain: false,
    fogStart: 45, viewDistance: 150, anisotropy: 1, particles: "off", detail: 1, defaultFps: 60,
  },
  verylow: {
    id: "verylow", shortSide: 420, minScale: 0.6, shadowMap: 0, post: "none", msaa: 0, bloomScale: 0, grain: false,
    fogStart: 40, viewDistance: 120, anisotropy: 1, particles: "off", detail: 0, defaultFps: 30,
  },
};

export interface GraphicsPrefs {
  quality: QualityPref;
  fps: FpsLimit;
  /** User override: false forces shadows off whatever the profile says. */
  shadows: boolean;
  /** Result of the automatic benchmark, kept between launches. */
  autoResolved: QualityId | null;
  /** Profiles that crashed or failed on this device. */
  unsafe: QualityId[];
}

export const DEFAULT_GRAPHICS: GraphicsPrefs = { quality: "auto", fps: 60, shadows: true, autoResolved: null, unsafe: [] };

export interface DeviceCaps {
  /** A render target can be drawn and sampled (needed for the internal resolution). */
  renderTarget: boolean;
  /** Half-float render targets for bloom and HDR. */
  halfFloat: boolean;
  /** Largest MSAA sample count for render targets (0 = none). */
  maxSamples: number;
  maxTextureSize: number;
  maxAnisotropy: number;
}

export const SAFE_CAPS: DeviceCaps = { renderTarget: false, halfFloat: false, maxSamples: 0, maxTextureSize: 2048, maxAnisotropy: 1 };

function isQuality(v: unknown): v is QualityId {
  return typeof v === "string" && (QUALITY_ORDER as string[]).includes(v);
}

export function parseGraphics(raw: string | null | undefined): GraphicsPrefs {
  if (!raw) return { ...DEFAULT_GRAPHICS };
  try {
    const v = JSON.parse(raw) as Partial<GraphicsPrefs>;
    return {
      quality: v.quality === "auto" || isQuality(v.quality) ? v.quality : "auto",
      fps: v.fps === 30 ? 30 : 60,
      shadows: v.shadows !== false,
      autoResolved: isQuality(v.autoResolved) ? v.autoResolved : null,
      unsafe: Array.isArray(v.unsafe) ? v.unsafe.filter(isQuality) : [],
    };
  } catch {
    return { ...DEFAULT_GRAPHICS };
  }
}

/** One step lower (stays at the bottom). */
export function lower(id: QualityId): QualityId {
  const i = QUALITY_ORDER.indexOf(id);
  return QUALITY_ORDER[Math.max(0, i - 1)];
}

/** Profile chosen from a short benchmark of the menu scene at "high". */
export function pickAutoQuality(avgFps: number): QualityId {
  if (avgFps >= 55) return "high";
  if (avgFps >= 45) return "medium";
  if (avgFps >= 35) return "low";
  return "verylow";
}

/** The profile id that should actually run, after "auto" and crash history. */
export function effectiveQuality(prefs: GraphicsPrefs): QualityId {
  let id: QualityId = prefs.quality === "auto" ? (prefs.autoResolved ?? "medium") : prefs.quality;
  while (prefs.unsafe.includes(id) && id !== "verylow") id = lower(id);
  return id;
}

/** Final settings: the profile limited by user overrides and what the GPU can do. */
export function resolveProfile(prefs: GraphicsPrefs, caps: DeviceCaps): QualityProfile {
  const base = PROFILES[effectiveQuality(prefs)];
  const p: QualityProfile = { ...base };
  if (!prefs.shadows) p.shadowMap = 0;
  if (!caps.renderTarget) {
    // Without render targets the scene is drawn straight to the screen at full size: keep it light.
    p.post = "none";
    p.msaa = 0;
    p.bloomScale = 0;
    p.grain = false;
    p.shadowMap = 0;
  }
  if (!caps.halfFloat) {
    p.bloomScale = 0;
    if (p.post === "full") p.post = "grade";
  }
  p.msaa = (Math.min(p.msaa, caps.maxSamples >= 4 ? 4 : caps.maxSamples >= 2 ? 2 : 0) as 0 | 2 | 4);
  p.anisotropy = Math.max(1, Math.min(p.anisotropy, caps.maxAnisotropy));
  return p;
}

/** Size of the internal render target for a screen size, profile and adaptive scale. */
export function internalSize(screenW: number, screenH: number, profile: QualityProfile, scale: number): { w: number; h: number; ratio: number } {
  const short = Math.max(1, Math.min(screenW, screenH));
  const cap = Math.min(1, profile.shortSide / short);
  const s = Math.max(profile.minScale, Math.min(1, scale));
  const ratio = Math.max(0.2, cap * s);
  return { w: Math.max(1, Math.round(screenW * ratio)), h: Math.max(1, Math.round(screenH * ratio)), ratio };
}
