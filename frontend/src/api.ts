const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `Sunucu hatası (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  createPlayer: (nickname: string) =>
    request<PlayerOut>("/players", { method: "POST", body: JSON.stringify({ nickname }) }),
  getPlayer: (id: string) => request<PlayerOut>(`/players/${id}`),
  updateNickname: (id: string, nickname: string) =>
    request<PlayerOut>(`/players/${id}`, { method: "PATCH", body: JSON.stringify({ nickname }) }),
  submitRun: (id: string, score: number, coins: number) =>
    request<PlayerOut>(`/players/${id}/runs`, { method: "POST", body: JSON.stringify({ score, coins }) }),
  getFriends: (id: string) => request<FriendsOut>(`/players/${id}/friends`),
  addFriend: (id: string, friendCode: string) =>
    request<PlayerOut>(`/players/${id}/friends`, { method: "POST", body: JSON.stringify({ friend_code: friendCode }) }),
  removeFriend: (id: string, friendId: string) =>
    request<{ ok: boolean }>(`/players/${id}/friends/${friendId}`, { method: "DELETE" }),
  leaderboard: (me: string | null) => request<PlayerOut[]>(`/leaderboard?limit=50${me ? `&me=${me}` : ""}`),
};
