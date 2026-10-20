import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { api, ApiError } from "@/src/api";
import { audio, DEFAULT_TRACK } from "@/src/audio";
import { storage } from "@/src/utils/storage";
import { configureRevenueCat, isPremium } from "@/src/subscription";

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
  sound: boolean;
  music: boolean;
  shadows: boolean;
  musicTrack: string;
  tutorialSeen: boolean;
  keys: number;
  playsSinceAd: number;
  songChanges: number;
  adFree: boolean;
}

interface ProfileApi extends ProfileState {
  recordRun: (r: { score: number; coins: number; distance: number }) => Promise<{ isRecord: boolean }>;
  setNickname: (n: string) => Promise<void>;
  setHaptics: (v: boolean) => Promise<void>;
  setSound: (v: boolean) => Promise<void>;
  setMusic: (v: boolean) => Promise<void>;
  setShadows: (v: boolean) => Promise<void>;
  setMusicTrack: (id: string) => Promise<void>;
  markTutorialSeen: () => Promise<void>;
  resetTutorial: () => Promise<void>;
  resetLocalData: () => Promise<void>;
  ensureOnline: () => Promise<string | null>;
  recoverOnline: () => Promise<string | null>;
  addKeys: (n: number) => Promise<void>;
  spendKeys: (n: number) => Promise<boolean>;
  /** Increments the play counter; returns true when an interstitial is due (every 3rd play). */
  registerPlay: () => Promise<boolean>;
  registerSongChange: () => Promise<void>;
  setAdFree: (v: boolean) => Promise<void>;
}

const KEYS = {
  playerId: "player_id",
  friendCode: "friend_code",
  nickname: "nickname",
  bestScore: "best_score",
  totalCoins: "total_coins",
  localScores: "local_scores",
  haptics: "haptics_enabled",
  sound: "sound_enabled",
  music: "music_enabled",
  shadows: "shadows_enabled",
  musicTrack: "music_track",
  tutorialSeen: "tutorial_seen",
  keys: "keys",
  playsSinceAd: "plays_since_ad",
  songChanges: "song_changes",
  adFree: "ad_free",
  welcomePack: "welcome_pack_granted",
};

export const INTERSTITIAL_EVERY = 3;
export const MAX_REVIVES = 5;
export const KEYS_PER_AD = 1;
export const WELCOME_KEYS = 50;
/** Subway Surfers style: 1, 2, 4, 8, 16 keys for successive revives in one run. */
export const reviveCost = (revivesUsed: number) => Math.pow(2, revivesUsed);

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
    sound: true,
    music: true,
    shadows: true,
    musicTrack: DEFAULT_TRACK,
    tutorialSeen: false,
    keys: 0,
    playsSinceAd: 0,
    songChanges: 0,
    adFree: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const creating = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    (async () => {
      const [playerId, friendCode, nickname, bestScore, totalCoins, scoresRaw, haptics, tutorialSeen, sound, music, shadows, musicTrack, keys, playsSinceAd, songChanges, adFree] =
        await Promise.all([
          storage.getItem<string | null>(KEYS.playerId, null),
          storage.getItem<string | null>(KEYS.friendCode, null),
          storage.getItem<string>(KEYS.nickname, ""),
          storage.getItem<number>(KEYS.bestScore, 0),
          storage.getItem<number>(KEYS.totalCoins, 0),
          storage.getItem<string>(KEYS.localScores, "[]"),
          storage.getItem<boolean>(KEYS.haptics, true),
          storage.getItem<boolean>(KEYS.tutorialSeen, false),
          storage.getItem<boolean>(KEYS.sound, true),
          storage.getItem<boolean>(KEYS.music, true),
          storage.getItem<boolean>(KEYS.shadows, true),
          storage.getItem<string>(KEYS.musicTrack, DEFAULT_TRACK),
          storage.getItem<number>(KEYS.keys, 0),
          storage.getItem<number>(KEYS.playsSinceAd, 0),
          storage.getItem<number>(KEYS.songChanges, 0),
          storage.getItem<boolean>(KEYS.adFree, false),
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
        sound: sound ?? true,
        music: music ?? true,
        shadows: shadows ?? true,
        musicTrack: musicTrack ?? DEFAULT_TRACK,
        tutorialSeen: tutorialSeen ?? false,
        keys: keys ?? 0,
        playsSinceAd: playsSinceAd ?? 0,
        songChanges: songChanges ?? 0,
        adFree: adFree ?? false,
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

  /** The server no longer knows our id: forget it, create a fresh profile and carry the best score over. */
  const recoverOnline = useCallback(async () => {
    await Promise.all([storage.removeItem(KEYS.playerId), storage.removeItem(KEYS.friendCode)]);
    stateRef.current = { ...stateRef.current, playerId: null, friendCode: null };
    setState((prev) => ({ ...prev, playerId: null, friendCode: null }));
    const id = await ensureOnline();
    const best = stateRef.current.bestScore;
    if (id && best > 0) api.submitRun(id, best, 0).catch(() => undefined);
    return id;
  }, [ensureOnline]);

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
      if (id) {
        api.submitRun(id, r.score, r.coins).catch((e) => {
          if (e instanceof ApiError && e.status === 404) void recoverOnline();
        });
      }
      return { isRecord };
    },
    [ensureOnline, recoverOnline],
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

  const setSound = useCallback(async (v: boolean) => {
    setState((prev) => ({ ...prev, sound: v }));
    audio.setSound(v);
    await storage.setItem(KEYS.sound, v);
  }, []);

  const setMusic = useCallback(async (v: boolean) => {
    setState((prev) => ({ ...prev, music: v }));
    audio.setMusic(v);
    await storage.setItem(KEYS.music, v);
  }, []);

  const setShadows = useCallback(async (v: boolean) => {
    setState((prev) => ({ ...prev, shadows: v }));
    await storage.setItem(KEYS.shadows, v);
  }, []);

  const setMusicTrack = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, musicTrack: id }));
    audio.setTrack(id);
    await storage.setItem(KEYS.musicTrack, id);
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

  /** Wipes local runs, best score and coins (online profile is kept). */
  const resetLocalData = useCallback(async () => {
    setState((prev) => ({ ...prev, bestScore: 0, totalCoins: 0, localScores: [] }));
    await Promise.all([storage.setItem(KEYS.bestScore, 0), storage.setItem(KEYS.totalCoins, 0), storage.setItem(KEYS.localScores, "[]")]);
  }, []);

  const addKeys = useCallback(async (n: number) => {
    const keys = Math.max(0, stateRef.current.keys + n);
    stateRef.current = { ...stateRef.current, keys };
    setState((prev) => ({ ...prev, keys }));
    await storage.setItem(KEYS.keys, keys);
  }, []);

  const spendKeys = useCallback(
    async (n: number) => {
      if (stateRef.current.keys < n) return false;
      await addKeys(-n);
      return true;
    },
    [addKeys],
  );

  const registerPlay = useCallback(async () => {
    const plays = stateRef.current.playsSinceAd + 1;
    const due = plays >= INTERSTITIAL_EVERY;
    const next = due ? 0 : plays;
    stateRef.current = { ...stateRef.current, playsSinceAd: next };
    setState((prev) => ({ ...prev, playsSinceAd: next }));
    await storage.setItem(KEYS.playsSinceAd, next);
    return due;
  }, []);

  const registerSongChange = useCallback(async () => {
    const songChanges = stateRef.current.songChanges + 1;
    stateRef.current = { ...stateRef.current, songChanges };
    setState((prev) => ({ ...prev, songChanges }));
    await storage.setItem(KEYS.songChanges, songChanges);
  }, []);

  const welcomePackGrantInProgress = useRef(false);
  const setAdFree = useCallback(
    async (v: boolean) => {
      setState((prev) => ({ ...prev, adFree: v }));
      await storage.setItem(KEYS.adFree, v);
      // Grant the welcome pack once, even if purchase and customer-info callbacks race.
      if (v && !welcomePackGrantInProgress.current) {
        welcomePackGrantInProgress.current = true;
        try {
          if (!(await storage.getItem<boolean>(KEYS.welcomePack, false))) {
            await addKeys(WELCOME_KEYS);
            await storage.setItem(KEYS.welcomePack, true);
          }
        } finally {
          welcomePackGrantInProgress.current = false;
        }
      }
    },
    [addKeys],
  );

  useEffect(() => {
    if (!state.loaded || Platform.OS !== "android" || !process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) return;

    let mounted = true;
    let listenerRegistered = false;
    let lastPremium: boolean | null = null;
    const syncCustomerInfo = (customerInfo: CustomerInfo) => {
      if (!mounted) return;
      const premium = isPremium(customerInfo);
      if (lastPremium === premium) return;
      lastPremium = premium;
      void setAdFree(premium).catch(() => undefined);
    };

    try {
      if (!configureRevenueCat()) return () => { mounted = false; };
      Purchases.addCustomerInfoUpdateListener(syncCustomerInfo);
      listenerRegistered = true;
      Purchases.getCustomerInfo().then(syncCustomerInfo).catch(() => undefined);
    } catch {
      // Subscription-service errors must not stop the game from opening.
    }

    return () => {
      mounted = false;
      if (listenerRegistered) Purchases.removeCustomerInfoUpdateListener(syncCustomerInfo);
    };
  }, [state.loaded, setAdFree]);

  const value = useMemo<ProfileApi>(
    () => ({
      ...state,
      recordRun,
      setNickname,
      setHaptics,
      setSound,
      setMusic,
      setShadows,
      setMusicTrack,
      markTutorialSeen,
      resetTutorial,
      resetLocalData,
      ensureOnline,
      recoverOnline,
      addKeys,
      spendKeys,
      registerPlay,
      registerSongChange,
      setAdFree,
    }),
    [state, recordRun, setNickname, setHaptics, setSound, setMusic, setShadows, setMusicTrack, markTutorialSeen, resetTutorial, resetLocalData, ensureOnline, recoverOnline, addKeys, spendKeys, registerPlay, registerSongChange, setAdFree],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
