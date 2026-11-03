// HTTP client for the Render API. v2 routes use a bearer token; the 1.0.x routes
// stay available as a fallback when the server is an older deployment.
import { t } from "@/src/i18n";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim().replace(/\/$/, "");
const BASE = BACKEND_URL ? `${BACKEND_URL}/api` : null;
const REQUEST_TIMEOUT_MS = 15_000;
// Render's free plan sleeps after 15 minutes; waking takes about a minute.
const WAKE_TIMEOUT_MS = 75_000;

// ----------------------------------------------------------------- types
export interface PlayerOut {
  id: string;
  nickname: string;
  friend_code: string;
  high_score: number;
  total_coins: number;
  runs: number;
  rank: number | null;
  is_me: boolean;
}

export interface FriendsOut {
  me: PlayerOut;
  friends: PlayerOut[];
  board: PlayerOut[];
}

export interface MeOut {
  id: string;
  public_id: string;
  nickname: string;
  friend_code: string;
  high_score: number;
  total_coins: number;
  runs: number;
  rank: number | null;
  hidden: boolean;
}

export interface PublicPlayer {
  public_id: string;
  nickname: string;
  high_score: number;
  total_coins: number;
  runs: number;
  rank: number | null;
  is_me: boolean;
  online: boolean | null;
}

export interface AuthOut {
  token: string;
  player: MeOut;
}

export interface FriendsOutV2 {
  me: PublicPlayer;
  friends: PublicPlayer[];
  board: PublicPlayer[];
}

export interface LeaderboardOut {
  top: PublicPlayer[];
  me: PublicPlayer | null;
}

export interface RunStartOut {
  run_id: string;
  seed: number;
  started_at: string;
}

export interface RunFinishBody {
  score: number;
  coins: number;
  distance: number;
  duration_ms: number;
  revives: number;
  district?: string | null;
  stats?: Record<string, number>;
}

export interface RunFinishOut {
  accepted: boolean;
  flagged: boolean;
  reasons: string[];
  new_record: boolean;
  player: MeOut;
}

export interface Mission {
  id: string;
  kind: string;
  target: number;
  progress: number;
  reward_keys: number;
  reward_coins: number;
  claimed: boolean;
}

export interface MissionsOut {
  day: string;
  missions: Mission[];
}

export interface MissionClaimOut {
  reward_keys: number;
  reward_coins: number;
  missions: MissionsOut;
}

export interface SaveOut {
  rev: number;
  data: Record<string, unknown>;
}

export interface GrantOut {
  granted: boolean;
  keys: number;
  already: boolean;
}

export interface MetaOut {
  api: number;
  features: Record<string, boolean>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ----------------------------------------------------------------- state
let authToken: string | null = null;
let awake = false;
let waking = false;
const wakeListeners = new Set<(waking: boolean) => void>();

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function hasBackend(): boolean {
  return BASE !== null;
}

function setWaking(v: boolean) {
  if (waking === v) return;
  waking = v;
  wakeListeners.forEach((fn) => fn(v));
}

/** Subscribe to "the server is waking up" (first request after Render slept). */
export function onWakingChange(fn: (waking: boolean) => void): () => void {
  wakeListeners.add(fn);
  return () => {
    wakeListeners.delete(fn);
  };
}

export function isWaking(): boolean {
  return waking;
}

interface RequestOptions {
  auth?: boolean;
  timeoutMs?: number;
  retries?: number;
}

async function request<T>(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<T> {
  if (!BASE) throw new ApiError(0, t("net.notConfigured"));
  const retries = opts.retries ?? ((init.method ?? "GET") === "GET" ? 1 : 0);
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeoutMs = opts.timeoutMs ?? (awake ? REQUEST_TIMEOUT_MS : WAKE_TIMEOUT_MS);
    const controller = new AbortController();
    const wakeTimer = !awake ? setTimeout(() => setWaking(true), 4000) : null;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { "Content-Type": "application/json", ...((init.headers as Record<string, string>) ?? {}) };
    if (authToken && opts.auth !== false) headers.Authorization = `Bearer ${authToken}`;
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { ...init, headers, signal: controller.signal });
    } catch {
      lastError = controller.signal.aborted ? new ApiError(408, t("net.timeout")) : new ApiError(0, t("net.offline"));
      continue;
    } finally {
      clearTimeout(timeout);
      if (wakeTimer) clearTimeout(wakeTimer);
    }
    awake = true;
    setWaking(false);
    if (!res.ok) {
      let detail = res.status === 429 ? t("net.rateLimited") : t("net.server", { status: res.status });
      try {
        const body = await res.json();
        if (typeof body?.detail === "string" && res.status !== 429) detail = body.detail;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  setWaking(false);
  throw lastError ?? new ApiError(0, t("net.offline"));
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

// ----------------------------------------------------------------- endpoints
export const api = {
  // 1.0.x routes (fallback for an older server)
  createPlayer: (nickname: string) => request<PlayerOut>("/players", { method: "POST", ...json({ nickname }) }, { auth: false }),
  getPlayer: (id: string) => request<PlayerOut>(`/players/${id}`),
  updateNickname: (id: string, nickname: string) => request<PlayerOut>(`/players/${id}`, { method: "PATCH", ...json({ nickname }) }),
  submitRun: (id: string, score: number, coins: number) => request<PlayerOut>(`/players/${id}/runs`, { method: "POST", ...json({ score, coins }) }),
  getFriends: (id: string) => request<FriendsOut>(`/players/${id}/friends`),
  addFriend: (id: string, friendCode: string) => request<PlayerOut>(`/players/${id}/friends`, { method: "POST", ...json({ friend_code: friendCode }) }),
  removeFriend: (id: string, friendId: string) => request<{ ok: boolean }>(`/players/${id}/friends/${friendId}`, { method: "DELETE" }),
  leaderboard: (me: string | null) => request<PlayerOut[]>(`/leaderboard?limit=50${me ? `&me=${me}` : ""}`),

  // 2.0 routes
  meta: () => request<MetaOut>("/v2/meta", {}, { auth: false }),
  createV2: (nickname: string) => request<AuthOut>("/v2/players", { method: "POST", ...json({ nickname }) }, { auth: false }),
  claim: (playerId: string, friendCode: string) =>
    request<AuthOut>("/v2/auth/claim", { method: "POST", ...json({ player_id: playerId, friend_code: friendCode }) }, { auth: false }),
  transfer: (code: string) => request<AuthOut>("/v2/auth/transfer", { method: "POST", ...json({ code }) }, { auth: false }),
  me: () => request<MeOut>("/v2/me"),
  rename: (nickname: string) => request<MeOut>("/v2/me", { method: "PATCH", ...json({ nickname }) }),
  deleteMe: () => request<{ ok: boolean }>("/v2/me", { method: "DELETE" }, { retries: 1 }),
  transferCode: () => request<{ code: string; expires_at: string }>("/v2/me/transfer-code", { method: "POST" }),
  startRun: (clientVersion: string, district: string | null) =>
    request<RunStartOut>("/v2/runs", { method: "POST", ...json({ client_version: clientVersion, district }) }),
  finishRun: (runId: string, body: RunFinishBody) =>
    request<RunFinishOut>(`/v2/runs/${encodeURIComponent(runId)}/finish`, { method: "POST", ...json(body) }, { retries: 1 }),
  friendsV2: () => request<FriendsOutV2>("/v2/me/friends"),
  addFriendV2: (friendCode: string) => request<PublicPlayer>("/v2/me/friends", { method: "POST", ...json({ friend_code: friendCode }) }),
  removeFriendV2: (publicId: string) => request<{ ok: boolean }>(`/v2/me/friends/${publicId}`, { method: "DELETE" }),
  blocks: () => request<PublicPlayer[]>("/v2/me/blocks"),
  block: (publicId: string) => request<{ ok: boolean }>(`/v2/me/blocks/${publicId}`, { method: "POST" }),
  unblock: (publicId: string) => request<{ ok: boolean }>(`/v2/me/blocks/${publicId}`, { method: "DELETE" }),
  report: (publicId: string, reason: "nickname" | "cheating" | "other") =>
    request<{ ok: boolean }>("/v2/reports", { method: "POST", ...json({ public_id: publicId, reason }) }),
  leaderboardV2: (limit = 50) => request<LeaderboardOut>(`/v2/leaderboard?limit=${limit}`),
  heartbeat: () => request<{ online: number }>("/v2/me/heartbeat", { method: "POST" }, { timeoutMs: 10_000 }),
  leave: () => request<{ ok: boolean }>("/v2/me/heartbeat", { method: "DELETE" }, { timeoutMs: 8_000 }),
  online: () => request<{ online: number }>("/v2/online", {}, { auth: false }),
  welcome: (localGranted: boolean) => request<GrantOut>("/v2/me/grants/welcome", { method: "POST", ...json({ local_granted: localGranted }) }),
  missions: () => request<MissionsOut>("/v2/me/missions"),
  claimMission: (id: string) => request<MissionClaimOut>(`/v2/me/missions/${encodeURIComponent(id)}/claim`, { method: "POST" }),
  getSave: () => request<SaveOut>("/v2/me/save"),
  putSave: (rev: number, data: Record<string, unknown>) => request<SaveOut>("/v2/me/save", { method: "PUT", ...json({ rev, data }) }),
};
