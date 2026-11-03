// District progress: three ferry-token pieces in a district open the next one.
// Pure functions, unit-tested in Node.
import { DISTRICT_ORDER, type DistrictId, isDistrict, nextDistrict } from "@/src/game/districts";

export const TOKENS_PER_DISTRICT = 3;

export interface Progress {
  current: DistrictId;
  unlocked: DistrictId[];
  tokens: Partial<Record<DistrictId, number>>;
}

export const DEFAULT_PROGRESS: Progress = { current: "istiklal", unlocked: ["istiklal"], tokens: {} };

export function parseProgress(raw: string | null | undefined): Progress {
  if (!raw) return { ...DEFAULT_PROGRESS, unlocked: [...DEFAULT_PROGRESS.unlocked], tokens: {} };
  try {
    const v = JSON.parse(raw) as Partial<Progress>;
    const unlocked = Array.isArray(v.unlocked) ? v.unlocked.filter(isDistrict) : [];
    if (!unlocked.includes("istiklal")) unlocked.unshift("istiklal");
    const tokens: Partial<Record<DistrictId, number>> = {};
    for (const id of DISTRICT_ORDER) {
      const n = Number((v.tokens as Record<string, unknown> | undefined)?.[id] ?? 0);
      if (n > 0) tokens[id] = Math.min(TOKENS_PER_DISTRICT, Math.floor(n));
    }
    const current = isDistrict(v.current) && unlocked.includes(v.current) ? v.current : "istiklal";
    return { current, unlocked, tokens };
  } catch {
    return { ...DEFAULT_PROGRESS, unlocked: ["istiklal"], tokens: {} };
  }
}

/** Tokens still needed in `district` before the next one opens (0 when done or last). */
export function tokensMissing(p: Progress, district: DistrictId): number {
  if (!nextDistrict(district)) return 0;
  const next = nextDistrict(district);
  if (next && p.unlocked.includes(next)) return 0;
  return TOKENS_PER_DISTRICT - (p.tokens[district] ?? 0);
}

/** Add one token piece; returns the new progress and the district it unlocked, if any. */
export function addToken(p: Progress, district: DistrictId): { progress: Progress; unlocked: DistrictId | null } {
  if (tokensMissing(p, district) <= 0) return { progress: p, unlocked: null };
  const have = Math.min(TOKENS_PER_DISTRICT, (p.tokens[district] ?? 0) + 1);
  const tokens = { ...p.tokens, [district]: have };
  let unlocked: DistrictId | null = null;
  const next = nextDistrict(district);
  const list = [...p.unlocked];
  if (have >= TOKENS_PER_DISTRICT && next && !list.includes(next)) {
    list.push(next);
    unlocked = next;
  }
  return { progress: { ...p, tokens, unlocked: list }, unlocked };
}

/** Distance at which the next token piece appears in a run (one piece per run at most). */
export function tokenDistance(p: Progress, district: DistrictId): number | null {
  const missing = tokensMissing(p, district);
  if (missing <= 0) return null;
  const k = TOKENS_PER_DISTRICT - missing; // pieces already collected
  return 450 + k * 350;
}

export function mergeProgress(a: Progress, b: Progress): Progress {
  const unlocked = DISTRICT_ORDER.filter((d) => a.unlocked.includes(d) || b.unlocked.includes(d));
  const tokens: Partial<Record<DistrictId, number>> = {};
  for (const d of DISTRICT_ORDER) {
    const n = Math.max(a.tokens[d] ?? 0, b.tokens[d] ?? 0);
    if (n > 0) tokens[d] = n;
  }
  return { current: unlocked.includes(a.current) ? a.current : "istiklal", unlocked, tokens };
}
