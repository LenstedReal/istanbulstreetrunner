// District levels: each district is a level with a goal for a single run
// (distance and coins). Completing it opens the next district and moves the
// player there; every level is faster and denser. Pure functions, unit-tested.
import { DISTRICT_ORDER, type DistrictId, isDistrict, nextDistrict } from "@/src/game/districts";

export interface LevelGoal {
  distance: number;
  coins: number;
}

/** Goals grow with every district. */
export const GOALS: Record<DistrictId, LevelGoal> = {
  istiklal: { distance: 600, coins: 40 },
  galata: { distance: 900, coins: 70 },
  eminonu: { distance: 1200, coins: 100 },
  bridge: { distance: 1500, coins: 130 },
  bosphorus: { distance: 2000, coins: 170 },
};

export interface BestRun {
  distance: number;
  coins: number;
}

export interface Progress {
  current: DistrictId;
  unlocked: DistrictId[];
  /** Districts whose goal has been completed. */
  done: DistrictId[];
  /** Best distance and best coins seen in each district (separately). */
  best: Partial<Record<DistrictId, BestRun>>;
}

export const DEFAULT_PROGRESS: Progress = { current: "istiklal", unlocked: ["istiklal"], done: [], best: {} };

/** 0-based level of a district (İstiklal = 0). */
export function levelOf(id: DistrictId): number {
  return Math.max(0, DISTRICT_ORDER.indexOf(id));
}

/** Highest level opened so far. */
export function topLevel(p: Progress): number {
  return Math.max(0, ...p.unlocked.map(levelOf));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function parseProgress(raw: string | null | undefined): Progress {
  const fresh = (): Progress => ({ current: "istiklal", unlocked: ["istiklal"], done: [], best: {} });
  if (!raw) return fresh();
  try {
    const v = JSON.parse(raw) as Partial<Progress> & { tokens?: unknown };
    if (!v || typeof v !== "object") return fresh();
    const unlocked = DISTRICT_ORDER.filter((d) => d === "istiklal" || (Array.isArray(v.unlocked) && v.unlocked.includes(d)));
    // A district is done when its goal was met; older saves only know that the next one opened.
    const done = DISTRICT_ORDER.filter((d) => {
      if (Array.isArray(v.done) && v.done.includes(d)) return true;
      const next = nextDistrict(d);
      return !!next && unlocked.includes(next);
    });
    const best: Partial<Record<DistrictId, BestRun>> = {};
    for (const d of DISTRICT_ORDER) {
      const b = (v.best as Record<string, Partial<BestRun>> | undefined)?.[d];
      if (b) best[d] = { distance: num(b.distance), coins: num(b.coins) };
    }
    const current = isDistrict(v.current) && unlocked.includes(v.current) ? v.current : unlocked[unlocked.length - 1];
    return { current, unlocked, done, best };
  } catch {
    return fresh();
  }
}

export function goalMet(goal: LevelGoal, distance: number, coins: number): boolean {
  return distance >= goal.distance && coins >= goal.coins;
}

export interface RunOutcome {
  progress: Progress;
  /** The goal of `district` was completed in this run for the first time. */
  completed: boolean;
  /** District opened by this run (the player is moved there). */
  unlocked: DistrictId | null;
}

/** Record a finished run in `district`. */
export function recordLevelRun(p: Progress, district: DistrictId, distance: number, coins: number): RunOutcome {
  const prev = p.best[district] ?? { distance: 0, coins: 0 };
  const best = { ...p.best, [district]: { distance: Math.max(prev.distance, distance), coins: Math.max(prev.coins, coins) } };
  let progress: Progress = { ...p, best };
  if (p.done.includes(district) || !goalMet(GOALS[district], distance, coins)) return { progress, completed: false, unlocked: null };
  const done = [...p.done, district];
  const next = nextDistrict(district);
  let unlocked: DistrictId | null = null;
  const list = [...p.unlocked];
  if (next && !list.includes(next)) {
    list.push(next);
    unlocked = next;
  }
  progress = { ...progress, done, unlocked: DISTRICT_ORDER.filter((d) => list.includes(d)), current: unlocked ?? progress.current };
  return { progress, completed: true, unlocked };
}

export function mergeProgress(a: Progress, b: Progress): Progress {
  const unlocked = DISTRICT_ORDER.filter((d) => a.unlocked.includes(d) || b.unlocked.includes(d));
  const done = DISTRICT_ORDER.filter((d) => a.done.includes(d) || b.done.includes(d));
  const best: Partial<Record<DistrictId, BestRun>> = {};
  for (const d of DISTRICT_ORDER) {
    const x = a.best[d];
    const y = b.best[d];
    if (x || y) best[d] = { distance: Math.max(x?.distance ?? 0, y?.distance ?? 0), coins: Math.max(x?.coins ?? 0, y?.coins ?? 0) };
  }
  return { current: unlocked.includes(a.current) ? a.current : "istiklal", unlocked, done, best };
}
