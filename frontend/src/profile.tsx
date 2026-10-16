import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

export interface LocalScore {
  score: number;
  coins: number;
  distance: number;
  date: string;
}

interface ProfileState {
  loaded: boolean;
  playerId: string | null;
  friendCode: string | null;
  nickname: string;
  bestScore: number;
  totalCoins: number;
  localScores: LocalScore[];
  haptics: boolean;
  tutorialSeen: boolean;
}

interface ProfileApi extends ProfileState {
  recordRun: (r: { score: number; coins: number; distance: number }) => Promise<{ isRecord: boolean }>;
  setNickname: (n: string) => Promise<void>;
  setHaptics: (v: boolean) => Promise<void>;
  markTutorialSeen: () => Promise<void>;
  resetTutorial: () => Promise<void>;
  ensureOnline: () => Promise<string | null>;
}

const KEYS = {
  playerId: "player_id",
  friendCode: "friend_code",
  nickname: "nickname",
  bestScore: "best_score",
  totalCoins: "total_coins",
  localScores: "local_scores",
  haptics: "haptics_enabled",
  tutorialSeen: "tutorial_seen",
};

const randomNickname = () => `Koşucu${Math.floor(1000 + Math.random() * 9000)}`;

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProfileState>({
    loaded: false,
    playerId: null,
    friendCode: null,
    nickname: "",
    bestScore: 0,
    totalCoins: 0,
    localScores: [],
    haptics: true,
    tutorialSeen: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const creating = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    (async () => {
      const [playerId, friendCode, nickname, bestScore, totalCoins, scoresRaw, haptics, tutorialSeen] = await Promise.all([
        storage.getItem<string | null>(KEYS.playerId, null),
        storage.getItem<string | null>(KEYS.friendCode, null),
        storage.getItem<string>(KEYS.nickname, ""),
        storage.getItem<number>(KEYS.bestScore, 0),
        storage.getItem<number>(KEYS.totalCoins, 0),
        storage.getItem<string>(KEYS.localScores, "[]"),
        storage.getItem<boolean>(KEYS.haptics, true),
        storage.getItem<boolean>(KEYS.tutorialSeen, false),
      ]);
      let localScores: LocalScore[] = [];
      try {
        localScores = JSON.parse(scoresRaw ?? "[]");
      } catch {
        localScores = [];
      }
      const nick = nickname || randomNickname();
      if (!nickname) await storage.setItem(KEYS.nickname, nick);
      setState({
        loaded: true,
        playerId: playerId ?? null,
        friendCode: friendCode ?? null,
        nickname: nick,
        bestScore: bestScore ?? 0,
        totalCoins: totalCoins ?? 0,
        localScores,
        haptics: haptics ?? true,
        tutorialSeen: tutorialSeen ?? false,
      });
    })();
  }, []);

  /** Creates the online profile lazily; returns the player id or null when offline. */
  const ensureOnline = useCallback(async (): Promise<string | null> => {
    const s = stateRef.current;
    if (s.playerId) return s.playerId;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      try {
        const p = await api.createPlayer(s.nickname || randomNickname());
        await Promise.all([storage.setItem(KEYS.playerId, p.id), storage.setItem(KEYS.friendCode, p.friend_code)]);
        setState((prev) => ({ ...prev, playerId: p.id, friendCode: p.friend_code }));
        return p.id;
      } catch {
        return null;
      } finally {
        creating.current = null;
      }
    })();
    return creating.current;
  }, []);

  // Create the online profile once local state is loaded (best effort).
  useEffect(() => {
    if (state.loaded && !state.playerId) void ensureOnline();
  }, [state.loaded, state.playerId, ensureOnline]);

  const recordRun = useCallback(
    async (r: { score: number; coins: number; distance: number }) => {
      const s = stateRef.current;
      const isRecord = r.score > s.bestScore && r.score > 0;
      const bestScore = Math.max(s.bestScore, r.score);
      const totalCoins = s.totalCoins + r.coins;
      const localScores = [...s.localScores, { ...r, date: new Date().toISOString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      setState((prev) => ({ ...prev, bestScore, totalCoins, localScores }));
      await Promise.all([
        storage.setItem(KEYS.bestScore, bestScore),
        storage.setItem(KEYS.totalCoins, totalCoins),
        storage.setItem(KEYS.localScores, JSON.stringify(localScores)),
      ]);
      const id = await ensureOnline();
      if (id) api.submitRun(id, r.score, r.coins).catch(() => undefined);
      return { isRecord };
    },
    [ensureOnline],
  );

  const setNickname = useCallback(async (n: string) => {
    const nick = n.trim().slice(0, 16);
    setState((prev) => ({ ...prev, nickname: nick }));
    await storage.setItem(KEYS.nickname, nick);
    const id = stateRef.current.playerId;
    if (id) await api.updateNickname(id, nick);
  }, []);

  const setHaptics = useCallback(async (v: boolean) => {
    setState((prev) => ({ ...prev, haptics: v }));
    await storage.setItem(KEYS.haptics, v);
  }, []);

  const markTutorialSeen = useCallback(async () => {
    if (stateRef.current.tutorialSeen) return;
    setState((prev) => ({ ...prev, tutorialSeen: true }));
    await storage.setItem(KEYS.tutorialSeen, true);
  }, []);

  const resetTutorial = useCallback(async () => {
    setState((prev) => ({ ...prev, tutorialSeen: false }));
    await storage.setItem(KEYS.tutorialSeen, false);
  }, []);

  const value = useMemo<ProfileApi>(
    () => ({ ...state, recordRun, setNickname, setHaptics, markTutorialSeen, resetTutorial, ensureOnline }),
    [state, recordRun, setNickname, setHaptics, markTutorialSeen, resetTutorial, ensureOnline],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
