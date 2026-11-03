// "Rate the game" prompt: asked after the 5th finished run, at most three times,
// never again after "rate" or "don't ask". No reward is given for rating (Play policy).
export const PLAY_PACKAGE = "com.lenstedreal.istanbulrunner";
export const RATE_FIRST_AT = 5;
export const RATE_AGAIN_AFTER = 10;
export const RATE_MAX_ASKS = 3;

export interface RateState {
  runs: number;
  next: number;
  asks: number;
  done: boolean;
}

export const DEFAULT_RATE: RateState = { runs: 0, next: RATE_FIRST_AT, asks: 0, done: false };

export function parseRate(raw: string | null | undefined): RateState {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<RateState> | null;
    if (!v) return { ...DEFAULT_RATE };
    const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);
    return { runs: n(v.runs, 0), next: n(v.next, RATE_FIRST_AT), asks: n(v.asks, 0), done: v.done === true };
  } catch {
    return { ...DEFAULT_RATE };
  }
}

export const rateDue = (s: RateState) => !s.done && s.runs >= s.next;
export const afterRun = (s: RateState): RateState => ({ ...s, runs: s.runs + 1 });

/** "Later": ask again after more runs; the third time is the last. */
export function postpone(s: RateState): RateState {
  const asks = s.asks + 1;
  return { ...s, asks, next: s.runs + RATE_AGAIN_AFTER, done: asks >= RATE_MAX_ASKS };
}

export const finish = (s: RateState): RateState => ({ ...s, asks: s.asks + 1, done: true });

