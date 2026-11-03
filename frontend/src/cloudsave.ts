// Progress that follows the account between phones: keys, coins spent and won,
// district progress and wardrobe. Pure functions, unit-tested in Node.
import { mergeProgress, parseProgress, type Progress } from "./progress";
import { parseWardrobe, type Wardrobe } from "./wardrobe";

export interface SaveData {
  v: 1;
  keys: number;
  coinsSpent: number;
  coinsBonus: number;
  progress: Progress;
  wardrobe: Wardrobe;
  best: number;
}

export function toSaveData(s: Omit<SaveData, "v">): SaveData {
  return { v: 1, ...s };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Read a server save defensively; unknown or broken fields fall back to empty values. */
export function parseSaveData(raw: Record<string, unknown> | null | undefined): SaveData | null {
  if (!raw || typeof raw !== "object" || raw.v !== 1) return null;
  return {
    v: 1,
    keys: num(raw.keys),
    coinsSpent: num(raw.coinsSpent),
    coinsBonus: num(raw.coinsBonus),
    progress: parseProgress(JSON.stringify(raw.progress ?? null)),
    wardrobe: parseWardrobe(JSON.stringify(raw.wardrobe ?? null)),
    best: num(raw.best),
  };
}

/**
 * Combine the phone's data with a newer server save.
 * `localSynced` is false on a phone that never uploaded (fresh install or a
 * transfer): then nothing on either side is lost (max/union). Otherwise the
 * server copy wins for keys and equipped clothes, and monotonic values keep the max.
 */
export function mergeSave(local: SaveData, remote: SaveData, localSynced: boolean): SaveData {
  const owned = Array.from(new Set([...local.wardrobe.owned, ...remote.wardrobe.owned]));
  const equipped = localSynced ? remote.wardrobe : local.wardrobe;
  return {
    v: 1,
    keys: localSynced ? remote.keys : Math.max(local.keys, remote.keys),
    coinsSpent: Math.max(local.coinsSpent, remote.coinsSpent),
    coinsBonus: Math.max(local.coinsBonus, remote.coinsBonus),
    progress: mergeProgress(localSynced ? remote.progress : local.progress, localSynced ? local.progress : remote.progress),
    wardrobe: parseWardrobe(JSON.stringify({ ...equipped, owned })),
    best: Math.max(local.best, remote.best),
  };
}

/** Coins the player can spend in the shop. */
export function coinBalance(totalCoins: number, coinsBonus: number, coinsSpent: number): number {
  return Math.max(0, totalCoins + coinsBonus - coinsSpent);
}

// ----------------------------------------------------------------- run queue
export interface PendingRun {
  runId: string;
  at: number;
  body: {
    score: number;
    coins: number;
    distance: number;
    duration_ms: number;
    revives: number;
    district?: string | null;
    stats?: Record<string, number>;
  };
}

export const PENDING_MAX = 5;
/** Server run sessions expire after 3 hours. */
export const PENDING_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export function parsePending(raw: string | null | undefined, now: number): PendingRun[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as PendingRun[];
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p && typeof p.runId === "string" && typeof p.at === "number" && now - p.at < PENDING_MAX_AGE_MS && p.body).slice(-PENDING_MAX);
  } catch {
    return [];
  }
}

export function enqueue(list: PendingRun[], run: PendingRun): PendingRun[] {
  return [...list.filter((p) => p.runId !== run.runId), run].slice(-PENDING_MAX);
}
