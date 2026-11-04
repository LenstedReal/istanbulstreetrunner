import Constants from "expo-constants";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { api, ApiError, hasBackend, onWakingChange, setAuthToken, type AuthOut, type MeOut, type MissionsOut, type PlayerOut } from "@/src/api";
import { audio, DEFAULT_TRACK } from "@/src/audio";
import {
  coinBalance,
  enqueue,
  mergeSave,
  parsePending,
  parseSaveData,
  toSaveData,
  type PendingRun,
  type SaveData,
} from "@/src/cloudsave";
import { isDistrict, type DistrictId } from "@/src/game/districts";
import { DEFAULT_GRAPHICS, parseGraphics, type GraphicsPrefs } from "@/src/game/quality/profiles";
import { getLang, setLang, type Lang } from "@/src/i18n";
import { DEFAULT_PROGRESS, levelOf, parseProgress, recordLevelRun, type Progress } from "@/src/progress";
import { afterRun, DEFAULT_RATE, finish, openStorePage, parseRate, postpone, rateDue, type RateState } from "@/src/rating";
import { configureRevenueCat, isPremium, linkAccount, premiumExpiry } from "@/src/subscription";
import { storage } from "@/src/utils/storage";
import { buy, DEFAULT_WARDROBE, equip, lookOf, parseWardrobe, type Wardrobe } from "@/src/wardrobe";

export interface LocalScore {
  score: number;
  coins: number;
  distance: number;
  date: string;
}

/**
 * online: v2 account with a token. legacy: the server is still 1.0.x.
 * offline: the server could not be reached (retried later). conflict: the old
 * profile was already claimed on another phone. none: no server configured.
 */
export type AccountState = "loading" | "online" | "legacy" | "offline" | "conflict" | "none";

export type RunStatus = "idle" | "pending" | "ranked" | "queued" | "notRanked" | "flagged";

export interface RunSession {
  runId: string;
  seed: number;
  at: number;
}

export interface FinishedRun {
  score: number;
  coins: number;
  distance: number;
  durationMs: number;
  district: DistrictId;
  token: boolean;
  revives: number;
  stats: { jumps: number; rolls: number; powerups: number };
}

interface ProfileState {
  loaded: boolean;
  account: AccountState;
  playerId: string | null;
  publicId: string | null;
  friendCode: string | null;
  nickname: string;
  bestScore: number;
  totalCoins: number;
  coinsSpent: number;
  coinsBonus: number;
  localScores: LocalScore[];
  haptics: boolean;
  sound: boolean;
  music: boolean;
  shadows: boolean;
  musicTrack: string;
  tutorialSeen: boolean;
  hintsSeen: string[];
  keys: number;
  playsSinceAd: number;
  songChanges: number;
  adFree: boolean;
  adFreeUntil: number | null;
  graphics: GraphicsPrefs;
  lang: Lang;
  langAuto: boolean;
  onlineVisible: boolean;
  onlineCount: number | null;
  missions: MissionsOut | null;
  progress: Progress;
  wardrobe: Wardrobe;
  lastRun: { status: RunStatus; newRecord: boolean };
  waking: boolean;
  rate: RateState;
}

interface ProfileApi extends ProfileState {
  coins: number;
  /** completed: the district goal was met for the first time; unlocked: district opened (the player moves there). */
  recordRun: (r: FinishedRun, session: RunSession | null) => Promise<{ isRecord: boolean; completed: boolean; unlocked: DistrictId | null }>;
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
  setAdFree: (v: boolean, until?: number | null) => Promise<void>;
  takeRunSession: () => RunSession | null;
  setGraphics: (patch: Partial<GraphicsPrefs>) => Promise<void>;
  setLanguage: (lang: Lang | "auto") => Promise<void>;
  setOnlineVisible: (v: boolean) => Promise<void>;
  markHintSeen: (kind: string) => Promise<void>;
  refreshMissions: () => Promise<void>;
  claimMission: (id: string) => Promise<{ keys: number; coins: number }>;
  buyItem: (id: string) => Promise<boolean>;
  equipItem: (id: string) => Promise<void>;
  selectDistrict: (id: DistrictId) => Promise<void>;
  /** 0-based level of the district the next run starts in. */
  levelForRun: () => number;
  deleteAccount: () => Promise<void>;
  /** After deleteAccount: start this phone as a brand-new player (new account, new nickname). */
  startFresh: () => Promise<void>;
  createTransferCode: () => Promise<{ code: string; expires_at: string }>;
  redeemTransferCode: (code: string) => Promise<void>;
  resolveConflictNewProfile: () => Promise<void>;
  retryConnect: () => Promise<void>;
  /** The "rate the game" question should be shown on this result screen. */
  rateAsk: boolean;
  answerRate: (answer: "rate" | "later" | "never") => Promise<void>;
  look: ReturnType<typeof lookOf>;
}

const KEYS = {
  playerId: "player_id",
  friendCode: "friend_code",
  publicId: "public_id",
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
  hintsSeen: "hints_seen",
  keys: "keys",
  playsSinceAd: "plays_since_ad",
  songChanges: "song_changes",
  adFree: "ad_free",
  adFreeUntil: "ad_free_until",
  welcomePack: "welcome_pack_granted",
  welcomePending: "welcome_pending",
  graphics: "graphics_settings",
  lang: "lang",
  onlineVisible: "online_visible",
  coinsSpent: "coins_spent",
  coinsBonus: "coins_bonus",
  progress: "progress",
  wardrobe: "wardrobe",
  saveRev: "save_rev",
  pendingRuns: "pending_runs",
  rate: "rate_prompt",
};
/** SecureStore key for the bearer token (only [A-Za-z0-9._-] is allowed). */
const TOKEN_KEY = "auth_token";

export const INTERSTITIAL_EVERY = 3;
export const MAX_REVIVES = 5;
export const KEYS_PER_AD = 1;
export const WELCOME_KEYS = 50;
/** 1, 2, 4, 8, 16 keys for successive revives in one run. */
export const reviveCost = (revivesUsed: number) => Math.pow(2, revivesUsed);

const SESSION_MAX_AGE_MS = 2.5 * 60 * 60 * 1000;
/** Offline grace for an expired subscription before the phone can re-check it. */
const AD_FREE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export const APP_VERSION = Constants.expoConfig?.version ?? "2.0.0";

const randomNickname = () => `Koşucu${Math.floor(1000 + Math.random() * 9000)}`;

const ProfileContext = createContext<ProfileApi | null>(null);

const INITIAL: ProfileState = {
  loaded: false,
  account: "loading",
  playerId: null,
  publicId: null,
  friendCode: null,
  nickname: "",
  bestScore: 0,
  totalCoins: 0,
  coinsSpent: 0,
  coinsBonus: 0,
  localScores: [],
  haptics: true,
  sound: true,
  music: true,
  shadows: true,
  musicTrack: DEFAULT_TRACK,
  tutorialSeen: false,
  hintsSeen: [],
  keys: 0,
  playsSinceAd: 0,
  songChanges: 0,
  adFree: false,
  adFreeUntil: null,
  graphics: DEFAULT_GRAPHICS,
  lang: getLang(),
  langAuto: true,
  onlineVisible: true,
  onlineCount: null,
  missions: null,
  progress: DEFAULT_PROGRESS,
  wardrobe: DEFAULT_WARDROBE,
  lastRun: { status: "idle", newRecord: false },
  waking: false,
  rate: DEFAULT_RATE,
};

const isNetworkError = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 408 || e.status >= 500);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProfileState>(INITIAL);
  // Every state change goes through patch(), which updates this ref first, so it is never written during render.
  const stateRef = useRef(state);
  const connecting = useRef<Promise<string | null> | null>(null);
  const session = useRef<RunSession | null>(null);
  const prefetching = useRef(false);
  const saveRev = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedThisSession = useRef(false);

  /** setState + keep the ref current, so async code right after sees the new values. */
  const patch = useCallback((p: Partial<ProfileState>) => {
    stateRef.current = { ...stateRef.current, ...p };
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  // ------------------------------------------------------------------ load
  useEffect(() => {
    (async () => {
      const g = (k: string, d: string | number | boolean | null) => storage.getItem(k, d);
      const [
        playerId, friendCode, publicId, nickname, bestScore, totalCoins, scoresRaw, haptics, tutorialSeen, sound, music, shadows,
        musicTrack, keys, playsSinceAd, songChanges, adFree, adFreeUntil, graphicsRaw, lang, onlineVisible, coinsSpent, coinsBonus,
        progressRaw, wardrobeRaw, hintsRaw, rev, rateRaw,
      ] = await Promise.all([
        g(KEYS.playerId, null), g(KEYS.friendCode, null), g(KEYS.publicId, null), g(KEYS.nickname, ""), g(KEYS.bestScore, 0),
        g(KEYS.totalCoins, 0), g(KEYS.localScores, "[]"), g(KEYS.haptics, true), g(KEYS.tutorialSeen, false), g(KEYS.sound, true),
        g(KEYS.music, true), g(KEYS.shadows, true), g(KEYS.musicTrack, DEFAULT_TRACK), g(KEYS.keys, 0), g(KEYS.playsSinceAd, 0),
        g(KEYS.songChanges, 0), g(KEYS.adFree, false), g(KEYS.adFreeUntil, null), g(KEYS.graphics, null), g(KEYS.lang, null),
        g(KEYS.onlineVisible, true), g(KEYS.coinsSpent, 0), g(KEYS.coinsBonus, 0), g(KEYS.progress, null), g(KEYS.wardrobe, null),
        g(KEYS.hintsSeen, "[]"), g(KEYS.saveRev, 0), g(KEYS.rate, null),
      ]);
      let localScores: LocalScore[] = [];
      let hintsSeen: string[] = [];
      try {
        localScores = JSON.parse((scoresRaw as string) ?? "[]");
      } catch {
        localScores = [];
      }
      try {
        hintsSeen = JSON.parse((hintsRaw as string) ?? "[]");
      } catch {
        hintsSeen = [];
      }
      const nick = (nickname as string) || randomNickname();
      if (!nickname) await storage.setItem(KEYS.nickname, nick);
      // 1.0.x kept only a shadows switch; carry it into the graphics settings once.
      const graphics = graphicsRaw ? parseGraphics(graphicsRaw as string) : { ...DEFAULT_GRAPHICS, shadows: shadows !== false };
      if (lang === "tr" || lang === "en") setLang(lang);
      saveRev.current = Number(rev) || 0;
      const until = typeof adFreeUntil === "number" ? adFreeUntil : null;
      patch({
        loaded: true,
        playerId: (playerId as string) ?? null,
        friendCode: (friendCode as string) ?? null,
        publicId: (publicId as string) ?? null,
        nickname: nick,
        bestScore: Number(bestScore) || 0,
        totalCoins: Number(totalCoins) || 0,
        localScores: Array.isArray(localScores) ? localScores : [],
        haptics: haptics !== false,
        sound: sound !== false,
        music: music !== false,
        shadows: graphics.shadows,
        musicTrack: (musicTrack as string) ?? DEFAULT_TRACK,
        tutorialSeen: tutorialSeen === true,
        hintsSeen: Array.isArray(hintsSeen) ? hintsSeen : [],
        keys: Number(keys) || 0,
        playsSinceAd: Number(playsSinceAd) || 0,
        songChanges: Number(songChanges) || 0,
        adFree: adFree === true && (until === null || until + AD_FREE_GRACE_MS > Date.now()),
        adFreeUntil: until,
        graphics,
        lang: getLang(),
        langAuto: lang !== "tr" && lang !== "en",
        onlineVisible: onlineVisible !== false,
        coinsSpent: Number(coinsSpent) || 0,
        coinsBonus: Number(coinsBonus) || 0,
        progress: parseProgress(progressRaw as string | null),
        wardrobe: parseWardrobe(wardrobeRaw as string | null),
        rate: parseRate(rateRaw as string | null),
      });
    })();
  }, [patch]);

  useEffect(() => onWakingChange((waking) => patch({ waking })), [patch]);

  // ------------------------------------------------------------- cloud save
  const currentSave = useCallback((): SaveData => {
    const s = stateRef.current;
    return toSaveData({ keys: s.keys, coinsSpent: s.coinsSpent, coinsBonus: s.coinsBonus, progress: s.progress, wardrobe: s.wardrobe, best: s.bestScore });
  }, []);

  const applySave = useCallback(
    async (d: SaveData) => {
      patch({ keys: d.keys, coinsSpent: d.coinsSpent, coinsBonus: d.coinsBonus, progress: d.progress, wardrobe: d.wardrobe, bestScore: Math.max(stateRef.current.bestScore, d.best) });
      await Promise.all([
        storage.setItem(KEYS.keys, d.keys),
        storage.setItem(KEYS.coinsSpent, d.coinsSpent),
        storage.setItem(KEYS.coinsBonus, d.coinsBonus),
        storage.setItem(KEYS.progress, JSON.stringify(d.progress)),
        storage.setItem(KEYS.wardrobe, JSON.stringify(d.wardrobe)),
        storage.setItem(KEYS.bestScore, stateRef.current.bestScore),
      ]);
    },
    [patch],
  );

  const pullSave = useCallback(async () => {
    if (stateRef.current.account !== "online") return;
    try {
      const remote = await api.getSave();
      const data = parseSaveData(remote.data);
      if (data && remote.rev > saveRev.current) {
        await applySave(mergeSave(currentSave(), data, saveRev.current > 0));
        saveRev.current = remote.rev;
        await storage.setItem(KEYS.saveRev, remote.rev);
      }
    } catch {
      // Retried on the next change or connect.
    }
  }, [applySave, currentSave]);

  const pushSave = useCallback(async () => {
    if (stateRef.current.account !== "online") return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await api.putSave(saveRev.current, currentSave() as unknown as Record<string, unknown>);
        saveRev.current = out.rev;
        await storage.setItem(KEYS.saveRev, out.rev);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Another phone saved first: merge its copy, then try once more.
          const remote = await api.getSave().catch(() => null);
          const data = remote ? parseSaveData(remote.data) : null;
          if (remote && data) {
            await applySave(mergeSave(currentSave(), data, true));
            saveRev.current = remote.rev;
          }
          continue;
        }
        return;
      }
    }
  }, [applySave, currentSave]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void pushSave(), 4000);
  }, [pushSave]);

  // ------------------------------------------------------------- run sessions
  const prefetchRun = useCallback(async () => {
    if (prefetching.current || stateRef.current.account !== "online") return;
    const cur = session.current;
    if (cur && Date.now() - cur.at < SESSION_MAX_AGE_MS) return;
    prefetching.current = true;
    try {
      const out = await api.startRun(APP_VERSION, stateRef.current.progress.current);
      session.current = { runId: out.run_id, seed: out.seed >>> 0, at: Date.now() };
    } catch {
      session.current = null;
    } finally {
      prefetching.current = false;
    }
  }, []);

  const takeRunSession = useCallback((): RunSession | null => {
    const cur = session.current;
    session.current = null;
    void prefetchRun();
    return cur && Date.now() - cur.at < SESSION_MAX_AGE_MS ? cur : null;
  }, [prefetchRun]);

  const flushPending = useCallback(async () => {
    if (stateRef.current.account !== "online") return;
    const list = parsePending(await storage.getItem<string>(KEYS.pendingRuns, "[]"), Date.now());
    const keep: PendingRun[] = [];
    for (const p of list) {
      try {
        await api.finishRun(p.runId, p.body);
      } catch (e) {
        if (isNetworkError(e)) keep.push(p);
      }
    }
    await storage.setItem(KEYS.pendingRuns, JSON.stringify(keep));
  }, []);

  // ------------------------------------------------------------- missions
  const refreshMissions = useCallback(async () => {
    if (stateRef.current.account !== "online") return;
    try {
      patch({ missions: await api.missions() });
    } catch {
      /* keep the last list */
    }
  }, [patch]);

  // ------------------------------------------------------------- welcome pack
  const addKeys = useCallback(
    async (n: number) => {
      const keys = Math.max(0, stateRef.current.keys + n);
      patch({ keys });
      await storage.setItem(KEYS.keys, keys);
      scheduleSave();
    },
    [patch, scheduleSave],
  );

  const welcomeBusy = useRef(false);
  const grantWelcome = useCallback(async () => {
    if (welcomeBusy.current || !stateRef.current.adFree) return;
    welcomeBusy.current = true;
    try {
      const localGranted = (await storage.getItem<boolean>(KEYS.welcomePack, false)) === true;
      const account = stateRef.current.account;
      if (account === "online") {
        try {
          const out = await api.welcome(localGranted);
          if (out.granted && out.keys > 0) await addKeys(out.keys);
          await storage.setItem(KEYS.welcomePack, true);
          await storage.setItem(KEYS.welcomePending, false);
        } catch (e) {
          // 403: the server sees no active subscription. Anything else: retry later.
          await storage.setItem(KEYS.welcomePending, !(e instanceof ApiError && e.status === 403));
        }
      } else if (account === "legacy" || account === "none") {
        // No 2.0 server: keep the 1.0.x behaviour (granted once on this phone).
        if (!localGranted) {
          await addKeys(WELCOME_KEYS);
          await storage.setItem(KEYS.welcomePack, true);
        }
      } else {
        await storage.setItem(KEYS.welcomePending, true);
      }
    } finally {
      welcomeBusy.current = false;
    }
  }, [addKeys]);

  // ------------------------------------------------------------- account
  const adopt = useCallback(
    async (me: MeOut, token?: string) => {
      if (token) {
        setAuthToken(token);
        await storage.secureSet(TOKEN_KEY, token);
      }
      await Promise.all([
        storage.setItem(KEYS.playerId, me.id),
        storage.setItem(KEYS.friendCode, me.friend_code),
        storage.setItem(KEYS.publicId, me.public_id),
        storage.setItem(KEYS.nickname, me.nickname),
      ]);
      const best = Math.max(stateRef.current.bestScore, me.high_score);
      patch({ account: "online", playerId: me.id, friendCode: me.friend_code, publicId: me.public_id, nickname: me.nickname, bestScore: best });
      await storage.setItem(KEYS.bestScore, best);
      void linkAccount(me.id);
      await pullSave();
      void flushPending();
      void refreshMissions();
      void prefetchRun();
      if (stateRef.current.adFree && (await storage.getItem<boolean>(KEYS.welcomePending, false))) void grantWelcome();
      if (saveRev.current === 0) scheduleSave();
    },
    [patch, pullSave, flushPending, refreshMissions, prefetchRun, grantWelcome, scheduleSave],
  );

  const legacyEnsure = useCallback(async (): Promise<string | null> => {
    const s = stateRef.current;
    if (s.playerId) {
      patch({ account: "legacy" });
      return s.playerId;
    }
    try {
      let p: PlayerOut;
      try {
        p = await api.createPlayer(s.nickname || randomNickname());
      } catch (e) {
        // The local name is taken or not allowed on the server: start with a fresh random one.
        if (e instanceof ApiError && (e.status === 409 || e.status === 422)) p = await api.createPlayer(randomNickname());
        else throw e;
      }
      await Promise.all([storage.setItem(KEYS.playerId, p.id), storage.setItem(KEYS.friendCode, p.friend_code), storage.setItem(KEYS.nickname, p.nickname)]);
      if (p.nickname !== s.nickname) patch({ nickname: p.nickname });
      patch({ account: "legacy", playerId: p.id, friendCode: p.friend_code });
      return p.id;
    } catch {
      patch({ account: "offline" });
      return null;
    }
  }, [patch]);

  const createFresh = useCallback(async (): Promise<string> => {
    let auth: AuthOut;
    try {
      auth = await api.createV2(stateRef.current.nickname || randomNickname());
    } catch (e) {
      // The local nickname may be taken (409) or not pass the server's rules (422); start with a fresh random one.
      if (e instanceof ApiError && (e.status === 409 || e.status === 422)) auth = await api.createV2(randomNickname());
      else throw e;
    }
    await adopt(auth.player, auth.token);
    return auth.player.id;
  }, [adopt]);

  const connect = useCallback(async (): Promise<string | null> => {
    if (!hasBackend()) {
      patch({ account: "none" });
      return null;
    }
    try {
      await api.meta();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return legacyEnsure();
      patch({ account: "offline" });
      return null;
    }
    try {
      const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
      if (token) {
        setAuthToken(token);
        try {
          const me = await api.me();
          await adopt(me);
          return me.id;
        } catch (e) {
          if (!(e instanceof ApiError && (e.status === 401 || e.status === 404))) throw e;
          setAuthToken(null);
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      const s = stateRef.current;
      if (s.playerId && s.friendCode) {
        try {
          const auth = await api.claim(s.playerId, s.friendCode);
          await adopt(auth.player, auth.token);
          return auth.player.id;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            patch({ account: "conflict" });
            return null;
          }
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          // The old profile no longer exists on the server: start a new one below.
        }
      }
      return await createFresh();
    } catch {
      patch({ account: "offline" });
      return null;
    }
  }, [patch, legacyEnsure, adopt, createFresh]);

  /** Connect once at a time; returns the player id or null. */
  const ensureOnline = useCallback(async (): Promise<string | null> => {
    const s = stateRef.current;
    if (s.account === "online" || s.account === "legacy") return s.playerId;
    if (s.account === "conflict" || deletedThisSession.current) return null;
    if (connecting.current) return connecting.current;
    connecting.current = connect().finally(() => {
      connecting.current = null;
    });
    return connecting.current;
  }, [connect]);

  useEffect(() => {
    if (!state.loaded || state.account !== "loading") return;
    const timer = setTimeout(() => void ensureOnline(), 0);
    return () => clearTimeout(timer);
  }, [state.loaded, state.account, ensureOnline]);

  // Retry when the app comes back to the foreground after being offline.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && stateRef.current.account === "offline") void ensureOnline();
    });
    return () => sub.remove();
  }, [ensureOnline]);

  const retryConnect = useCallback(async () => {
    if (stateRef.current.account === "offline") {
      patch({ account: "loading" });
      await ensureOnline();
    }
  }, [patch, ensureOnline]);

  /** Legacy servers only: the stored id is gone, create a new profile. */
  const recoverOnline = useCallback(async () => {
    if (stateRef.current.account !== "legacy") return stateRef.current.playerId;
    await Promise.all([storage.removeItem(KEYS.playerId), storage.removeItem(KEYS.friendCode)]);
    patch({ playerId: null, friendCode: null });
    return legacyEnsure();
  }, [patch, legacyEnsure]);

  const resolveConflictNewProfile = useCallback(async () => {
    await Promise.all([storage.removeItem(KEYS.playerId), storage.removeItem(KEYS.friendCode), storage.removeItem(KEYS.publicId)]);
    saveRev.current = 0;
    await storage.setItem(KEYS.saveRev, 0);
    patch({ playerId: null, friendCode: null, publicId: null, account: "loading" });
    try {
      await createFresh();
    } catch {
      patch({ account: "offline" });
    }
  }, [patch, createFresh]);

  const redeemTransferCode = useCallback(
    async (code: string) => {
      const auth = await api.transfer(code);
      // The phone takes over the account: its own unsynced data is merged, not lost.
      saveRev.current = 0;
      await adopt(auth.player, auth.token);
    },
    [adopt],
  );

  const createTransferCode = useCallback(async () => {
    if (stateRef.current.account !== "online") throw new ApiError(0, "offline");
    return api.transferCode();
  }, []);

  const deleteAccount = useCallback(async () => {
    if (stateRef.current.account !== "online") throw new ApiError(0, "offline");
    // Only the server call can fail. Once it succeeded the account is gone, so the
    // local clean-up below must never turn into a "could not delete" message.
    await api.deleteMe();
    deletedThisSession.current = true;
    setAuthToken(null);
    session.current = null;
    saveRev.current = 0;
    const nick = randomNickname();
    try {
      await storage.secureRemove(TOKEN_KEY);
      const wipe = [
        KEYS.playerId, KEYS.friendCode, KEYS.publicId, KEYS.bestScore, KEYS.totalCoins, KEYS.localScores, KEYS.keys, KEYS.coinsSpent,
        KEYS.coinsBonus, KEYS.progress, KEYS.wardrobe, KEYS.saveRev, KEYS.pendingRuns, KEYS.hintsSeen, KEYS.welcomePending, KEYS.rate,
      ];
      await Promise.all(wipe.map((k) => storage.removeItem(k)));
      await storage.setItem(KEYS.nickname, nick);
    } catch (e) {
      console.warn("[profile] local wipe after deletion", e);
    }
    patch({
      account: "none",
      playerId: null,
      friendCode: null,
      publicId: null,
      nickname: nick,
      bestScore: 0,
      totalCoins: 0,
      localScores: [],
      keys: 0,
      coinsSpent: 0,
      coinsBonus: 0,
      progress: DEFAULT_PROGRESS,
      wardrobe: DEFAULT_WARDROBE,
      missions: null,
      hintsSeen: [],
    });
  }, [patch]);

  const startFresh = useCallback(async () => {
    deletedThisSession.current = false;
    patch({ account: "loading" });
    await ensureOnline();
  }, [patch, ensureOnline]);

  // ------------------------------------------------------------- presence
  useEffect(() => {
    if (state.account !== "online") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      const visible = stateRef.current.onlineVisible;
      (visible ? api.heartbeat() : api.online())
        .then((r) => patch({ onlineCount: r.online }))
        .catch(() => undefined);
    };
    const startBeat = () => {
      if (timer) return;
      beat();
      timer = setInterval(beat, 60_000);
    };
    const stopBeat = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (stateRef.current.onlineVisible) api.leave().catch(() => undefined);
    };
    if (AppState.currentState === "active") startBeat();
    const sub = AppState.addEventListener("change", (s) => (s === "active" ? startBeat() : stopBeat()));
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [state.account, state.onlineVisible, patch]);

  const setOnlineVisible = useCallback(
    async (v: boolean) => {
      patch({ onlineVisible: v });
      await storage.setItem(KEYS.onlineVisible, v);
      if (!v && stateRef.current.account === "online") api.leave().catch(() => undefined);
    },
    [patch],
  );

  // ------------------------------------------------------------- runs
  const recordRun = useCallback(
    async (r: FinishedRun, sess: RunSession | null) => {
      const s = stateRef.current;
      const isRecord = r.score > s.bestScore && r.score > 0;
      const bestScore = Math.max(s.bestScore, r.score);
      const totalCoins = s.totalCoins + r.coins;
      const localScores = [...s.localScores, { score: r.score, coins: r.coins, distance: r.distance, date: new Date().toISOString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      const level = recordLevelRun(s.progress, r.district, r.distance, r.coins);
      const progress = level.progress;
      const { completed, unlocked } = level;
      const rate = afterRun(s.rate);
      patch({ bestScore, totalCoins, localScores, progress, rate, lastRun: { status: "pending", newRecord: false } });
      await Promise.all([
        storage.setItem(KEYS.bestScore, bestScore),
        storage.setItem(KEYS.totalCoins, totalCoins),
        storage.setItem(KEYS.localScores, JSON.stringify(localScores)),
        storage.setItem(KEYS.progress, JSON.stringify(progress)),
        storage.setItem(KEYS.rate, JSON.stringify(rate)),
      ]);
      scheduleSave();
      if (unlocked) {
        // The next run starts in the new district: get a fresh server session for it.
        session.current = null;
        void prefetchRun();
      }

      // Server submission runs in the background; the result screen does not wait for it.
      void (async () => {
        const account = stateRef.current.account;
        if (account === "legacy") {
          const id = stateRef.current.playerId;
          if (!id) return patch({ lastRun: { status: "notRanked", newRecord: false } });
          try {
            await api.submitRun(id, r.score, r.coins);
            patch({ lastRun: { status: "ranked", newRecord: false } });
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) void recoverOnline();
            patch({ lastRun: { status: "notRanked", newRecord: false } });
          }
          return;
        }
        if (!sess) return patch({ lastRun: { status: "notRanked", newRecord: false } });
        const body: PendingRun["body"] = {
          score: r.score,
          coins: r.coins,
          distance: r.distance,
          duration_ms: r.durationMs,
          revives: r.revives,
          district: r.district,
          stats: { jumps: r.stats.jumps, rolls: r.stats.rolls, powerups: r.stats.powerups },
        };
        const queue = async () => {
          const list = parsePending(await storage.getItem<string>(KEYS.pendingRuns, "[]"), Date.now());
          await storage.setItem(KEYS.pendingRuns, JSON.stringify(enqueue(list, { runId: sess.runId, at: sess.at, body })));
          patch({ lastRun: { status: "queued", newRecord: false } });
        };
        if (account !== "online") return queue();
        try {
          const out = await api.finishRun(sess.runId, body);
          patch({ lastRun: { status: out.flagged ? "flagged" : out.accepted ? "ranked" : "notRanked", newRecord: out.new_record } });
          if (out.accepted) void refreshMissions();
        } catch (e) {
          if (isNetworkError(e)) await queue();
          else patch({ lastRun: { status: "notRanked", newRecord: false } });
        }
      })();
      return { isRecord, completed, unlocked };
    },
    [patch, scheduleSave, recoverOnline, refreshMissions, prefetchRun],
  );

  // ------------------------------------------------------------- settings
  const setNickname = useCallback(
    async (n: string) => {
      const nick = n.trim().slice(0, 16);
      const account = stateRef.current.account;
      if (account === "online") {
        // The server checks the name; only a name it accepted is kept.
        const me = await api.rename(nick);
        patch({ nickname: me.nickname });
        await storage.setItem(KEYS.nickname, me.nickname);
        return;
      }
      const id = stateRef.current.playerId;
      // On the 1.0.x server the name is also checked there (taken / not allowed) before it is kept.
      if (account === "legacy" && id) await api.updateNickname(id, nick);
      else if (account !== "none") throw new ApiError(0, "offline");
      patch({ nickname: nick });
      await storage.setItem(KEYS.nickname, nick);
    },
    [patch],
  );

  const bool = useCallback(
    (key: keyof ProfileState, storeKey: string, after?: (v: boolean) => void) => async (v: boolean) => {
      patch({ [key]: v } as Partial<ProfileState>);
      after?.(v);
      await storage.setItem(storeKey, v);
    },
    [patch],
  );
  const setHaptics = useMemo(() => bool("haptics", KEYS.haptics), [bool]);
  const setSound = useMemo(() => bool("sound", KEYS.sound, (v) => audio.setSound(v)), [bool]);
  const setMusic = useMemo(() => bool("music", KEYS.music, (v) => audio.setMusic(v)), [bool]);

  const setGraphics = useCallback(
    async (p: Partial<GraphicsPrefs>) => {
      const graphics = { ...stateRef.current.graphics, ...p };
      patch({ graphics, shadows: graphics.shadows });
      await Promise.all([storage.setItem(KEYS.graphics, JSON.stringify(graphics)), storage.setItem(KEYS.shadows, graphics.shadows)]);
    },
    [patch],
  );
  const setShadows = useCallback((v: boolean) => setGraphics({ shadows: v }), [setGraphics]);

  const setLanguage = useCallback(
    async (l: Lang | "auto") => {
      if (l === "auto") {
        await storage.removeItem(KEYS.lang);
        let auto: Lang = "en";
        try {
          auto = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("tr") ? "tr" : "en";
        } catch {
          auto = "tr";
        }
        setLang(auto);
        patch({ lang: auto, langAuto: true });
        return;
      }
      setLang(l);
      patch({ lang: l, langAuto: false });
      await storage.setItem(KEYS.lang, l);
    },
    [patch],
  );

  const setMusicTrack = useCallback(
    async (id: string) => {
      patch({ musicTrack: id });
      audio.setTrack(id);
      await storage.setItem(KEYS.musicTrack, id);
    },
    [patch],
  );

  const markTutorialSeen = useCallback(async () => {
    if (stateRef.current.tutorialSeen) return;
    patch({ tutorialSeen: true });
    await storage.setItem(KEYS.tutorialSeen, true);
  }, [patch]);

  const markHintSeen = useCallback(
    async (kind: string) => {
      if (stateRef.current.hintsSeen.includes(kind)) return;
      const hintsSeen = [...stateRef.current.hintsSeen, kind];
      patch({ hintsSeen });
      await storage.setItem(KEYS.hintsSeen, JSON.stringify(hintsSeen));
    },
    [patch],
  );

  const resetTutorial = useCallback(async () => {
    patch({ tutorialSeen: false, hintsSeen: [] });
    await Promise.all([storage.setItem(KEYS.tutorialSeen, false), storage.setItem(KEYS.hintsSeen, "[]")]);
  }, [patch]);

  /** Wipes this phone's best score and run history (the online profile and coins are kept). */
  const resetLocalData = useCallback(async () => {
    patch({ bestScore: 0, localScores: [] });
    await Promise.all([storage.setItem(KEYS.bestScore, 0), storage.setItem(KEYS.localScores, "[]")]);
  }, [patch]);

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
    patch({ playsSinceAd: next });
    await storage.setItem(KEYS.playsSinceAd, next);
    return due;
  }, [patch]);

  const registerSongChange = useCallback(async () => {
    const songChanges = stateRef.current.songChanges + 1;
    patch({ songChanges });
    await storage.setItem(KEYS.songChanges, songChanges);
  }, [patch]);

  const setAdFree = useCallback(
    async (v: boolean, until: number | null = null) => {
      patch({ adFree: v, adFreeUntil: v ? until : null });
      await Promise.all([storage.setItem(KEYS.adFree, v), storage.setItem(KEYS.adFreeUntil, v ? until : null)]);
      if (v) await grantWelcome();
    },
    [patch, grantWelcome],
  );

  // RevenueCat: entitlement and expiry follow the store; the player id links purchases to the account.
  useEffect(() => {
    if (!state.loaded || Platform.OS !== "android" || !process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) return;
    let mounted = true;
    let listenerRegistered = false;
    let last: string | null = null;
    const sync = (info: CustomerInfo) => {
      if (!mounted) return;
      const premium = isPremium(info);
      const until = premium ? premiumExpiry(info) : null;
      const key = `${premium}:${until}`;
      if (key === last) return;
      last = key;
      void setAdFree(premium, until).catch(() => undefined);
    };
    try {
      if (!configureRevenueCat()) return () => void (mounted = false);
      Purchases.addCustomerInfoUpdateListener(sync);
      listenerRegistered = true;
      Purchases.getCustomerInfo().then(sync).catch(() => undefined);
    } catch {
      // Subscription-service errors must not stop the game from opening.
    }
    return () => {
      mounted = false;
      if (listenerRegistered) Purchases.removeCustomerInfoUpdateListener(sync);
    };
  }, [state.loaded, setAdFree]);

  // ------------------------------------------------------------- missions, shop, districts
  const claimMission = useCallback(
    async (id: string) => {
      const out = await api.claimMission(id);
      patch({ missions: out.missions });
      if (out.reward_keys > 0) await addKeys(out.reward_keys);
      if (out.reward_coins > 0) {
        const coinsBonus = stateRef.current.coinsBonus + out.reward_coins;
        patch({ coinsBonus });
        await storage.setItem(KEYS.coinsBonus, coinsBonus);
        scheduleSave();
      }
      return { keys: out.reward_keys, coins: out.reward_coins };
    },
    [patch, addKeys, scheduleSave],
  );

  const buyItem = useCallback(
    async (id: string) => {
      const s = stateRef.current;
      const out = buy(s.wardrobe, id, coinBalance(s.totalCoins, s.coinsBonus, s.coinsSpent));
      if (!out) return false;
      const coinsSpent = s.coinsSpent + out.cost;
      patch({ wardrobe: out.wardrobe, coinsSpent });
      await Promise.all([storage.setItem(KEYS.wardrobe, JSON.stringify(out.wardrobe)), storage.setItem(KEYS.coinsSpent, coinsSpent)]);
      scheduleSave();
      return true;
    },
    [patch, scheduleSave],
  );

  const equipItem = useCallback(
    async (id: string) => {
      const wardrobe = equip(stateRef.current.wardrobe, id);
      patch({ wardrobe });
      await storage.setItem(KEYS.wardrobe, JSON.stringify(wardrobe));
      scheduleSave();
    },
    [patch, scheduleSave],
  );

  const selectDistrict = useCallback(
    async (id: DistrictId) => {
      const p = stateRef.current.progress;
      if (!isDistrict(id) || !p.unlocked.includes(id)) return;
      const progress = { ...p, current: id };
      patch({ progress });
      await storage.setItem(KEYS.progress, JSON.stringify(progress));
      session.current = null;
      void prefetchRun();
      scheduleSave();
    },
    [patch, prefetchRun, scheduleSave],
  );

  const levelForRun = useCallback(() => levelOf(stateRef.current.progress.current), []);

  const answerRate = useCallback(
    async (answer: "rate" | "later" | "never") => {
      const cur = stateRef.current.rate;
      const rate = answer === "later" ? postpone(cur) : finish(cur);
      patch({ rate });
      await storage.setItem(KEYS.rate, JSON.stringify(rate));
      if (answer === "rate") await openStorePage();
    },
    [patch],
  );

  const look = useMemo(() => lookOf(state.wardrobe), [state.wardrobe]);

  const value = useMemo<ProfileApi>(
    () => ({
      ...state,
      coins: coinBalance(state.totalCoins, state.coinsBonus, state.coinsSpent),
      rateAsk: rateDue(state.rate),
      answerRate,
      look,
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
      takeRunSession,
      setGraphics,
      setLanguage,
      setOnlineVisible,
      markHintSeen,
      refreshMissions,
      claimMission,
      buyItem,
      equipItem,
      selectDistrict,
      levelForRun,
      deleteAccount,
      startFresh,
      createTransferCode,
      redeemTransferCode,
      resolveConflictNewProfile,
      retryConnect,
    }),
    [
      state, look, recordRun, setNickname, setHaptics, setSound, setMusic, setShadows, setMusicTrack, markTutorialSeen, resetTutorial,
      resetLocalData, ensureOnline, recoverOnline, addKeys, spendKeys, registerPlay, registerSongChange, setAdFree, takeRunSession,
      setGraphics, setLanguage, setOnlineVisible, markHintSeen, refreshMissions, claimMission, buyItem, equipItem, selectDistrict,
      levelForRun, deleteAccount, startFresh, createTransferCode, redeemTransferCode, resolveConflictNewProfile, retryConnect, answerRate,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
