// Fixed-step simulation: the game logic always advances in 1/120 s steps so the
// physics and collisions behave the same at 30, 60 or 120 FPS.
export const STEP = 1 / 120;
export const MAX_STEPS = 6;

export interface StepPlan {
  steps: number;
  /** Time left in the accumulator for the next frame. */
  acc: number;
}

/** How many fixed steps to run for a frame of `dt` seconds. Long stalls are dropped, not replayed. */
export function plan(acc: number, dt: number, step = STEP, maxSteps = MAX_STEPS): StepPlan {
  let a = acc + Math.max(0, Math.min(dt, 0.25));
  let steps = Math.floor(a / step);
  if (steps > maxSteps) {
    steps = maxSteps;
    a = 0;
  } else {
    a -= steps * step;
  }
  return { steps, acc: a };
}

/** Frame pacing for a FPS cap: true when this display refresh should be skipped. */
export function skipFrame(sinceLastMs: number, fps: number): boolean {
  if (fps <= 0) return false;
  // 2 ms tolerance so a 60 Hz display is not halved by timer jitter.
  return sinceLastMs < 1000 / fps - 2;
}
