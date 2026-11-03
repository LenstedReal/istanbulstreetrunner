// Adaptive render scale: lowers the internal resolution when frames are slow and
// raises it back when there is headroom. Pure, unit-tested in Node.
export interface ScaleState {
  scale: number;
  /** Smoothed frame time in ms. */
  avgMs: number;
  slowFor: number;
  fastFor: number;
}

export const SCALE_STEP = 0.1;

export function initialScale(): ScaleState {
  return { scale: 1, avgMs: 0, slowFor: 0, fastFor: 0 };
}

/**
 * Feed one frame. `targetFps` is the FPS cap, `minScale` the profile floor.
 * Returns the new state; `scale` changes at most by SCALE_STEP per call.
 */
export function updateScale(s: ScaleState, frameMs: number, targetFps: number, minScale: number): ScaleState {
  const ms = Math.max(1, Math.min(frameMs, 200));
  const avgMs = s.avgMs === 0 ? ms : s.avgMs * 0.92 + ms * 0.08;
  const budget = 1000 / targetFps;
  let { scale, slowFor, fastFor } = s;
  const dt = ms / 1000;
  if (avgMs > budget * 1.18) {
    slowFor += dt;
    fastFor = 0;
  } else if (avgMs < budget * 1.03) {
    fastFor += dt;
    slowFor = 0;
  } else {
    slowFor = Math.max(0, slowFor - dt);
    fastFor = Math.max(0, fastFor - dt);
  }
  if (slowFor > 1.5 && scale > minScale) {
    scale = Math.max(minScale, Math.round((scale - SCALE_STEP) * 100) / 100);
    slowFor = 0;
  } else if (fastFor > 5 && scale < 1) {
    scale = Math.min(1, Math.round((scale + SCALE_STEP) * 100) / 100);
    fastFor = 0;
  }
  return { scale, avgMs, slowFor, fastFor };
}

/** Running FPS average for the automatic quality benchmark. */
export class FpsMeter {
  private frames = 0;
  private time = 0;
  add(dtSeconds: number) {
    if (dtSeconds <= 0 || dtSeconds > 0.5) return;
    this.frames++;
    this.time += dtSeconds;
  }
  get seconds() {
    return this.time;
  }
  get fps() {
    return this.time > 0 ? this.frames / this.time : 0;
  }
  reset() {
    this.frames = 0;
    this.time = 0;
  }
}
