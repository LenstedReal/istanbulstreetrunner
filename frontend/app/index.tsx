import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from "react-native";

import { ads } from "@/src/ads/ads";
import { audio } from "@/src/audio";
import { ChunkyButton } from "@/src/components/ChunkyButton";
import { GameOverSheet } from "@/src/components/game/GameOverSheet";
import { Hud } from "@/src/components/game/Hud";
import { IntroOverlay } from "@/src/components/game/IntroOverlay";
import { MainMenu } from "@/src/components/game/MainMenu";
import { ReviveSheet } from "@/src/components/game/ReviveSheet";
import { Sheet, SheetActions } from "@/src/components/game/Sheet";
import { Toast } from "@/src/components/game/Toast";
import { TutorialOverlay } from "@/src/components/game/TutorialOverlay";
import { OBSTACLES, type DistrictId } from "@/src/game/districts";
import {
  EngineCallbacks,
  GameEvent,
  GameInput,
  HudState,
  RunResult,
  RunnerEngine,
  getSessionShadowMode,
  resetSessionShadowMode,
} from "@/src/game/engine";
import { effectiveQuality, pickAutoQuality, resolveProfile } from "@/src/game/quality/profiles";
import { probeCaps } from "@/src/game/render/pipeline";
import { fmt, t, useT } from "@/src/i18n";
import { MAX_REVIVES, reviveCost, useProfile, type RunSession } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type Mode = "menu" | "playing" | "paused" | "crashed" | "gameover";

const EMPTY_HUD: HudState = { score: 0, coins: 0, keys: 0, multiplier: 1, distance: 0, speedKmh: 0, powerup: null, shield: false, stumble: 0 };
const SWIPE_PX = 26;
const SFX = {
  crash: "crash",
  coin: "coin",
  key: "powerup",
  jump: "jump",
  roll: "roll",
  lane: "swipe",
  powerup: "powerup",
  "shield-break": "shield",
  stumble: "shield",
  token: "powerup",
  wings: "powerup",
  carpet: "powerup",
} as const;

export default function GameScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const profile = useProfile();
  useT();

  const [mode, setMode] = useState<Mode>("menu");
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRecord, setIsRecord] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ tokens: number; unlocked: DistrictId | null } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [glReady, setGlReady] = useState(false);
  const [glKey, setGlKey] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [revives, setRevives] = useState(0);
  const [adBusy, setAdBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; icon: "bulb" | "boat" | "warning" } | null>(null);
  const [transferCode, setTransferCode] = useState("");
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const engineRef = useRef<RunnerEngine | null>(null);
  const modeRef = useRef<Mode>("menu");
  const profileRef = useRef(profile);
  const revivesRef = useRef(0);
  const resumeAfterRouteRef = useRef(false);
  const pendingInterstitialRef = useRef(false);
  const sessionRef = useRef<RunSession | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTutorialRef = useRef(false);
  const touch = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  // Refs mirror the latest render for engine callbacks and gestures (updated after commit, never during render).
  useEffect(() => {
    modeRef.current = mode;
    profileRef.current = profile;
    showTutorialRef.current = showTutorial;
  });
  /** Quality and shadows the current GL view was built with. */
  const builtWith = useRef<string | null>(null);

  const graphicsKey = useCallback(() => {
    const g = profileRef.current.graphics;
    return `${effectiveQuality(g)}:${g.shadows}`;
  }, []);

  const showToast = useCallback((text: string, icon: "bulb" | "boat" | "warning" = "bulb", ms = 2600) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, icon });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /** Interstitials only at game over, only when one is already loaded; otherwise it waits for the next game over. */
  const maybeShowInterstitial = useCallback(async () => {
    if (!pendingInterstitialRef.current) return;
    if (profileRef.current.adFree || !ads.available) {
      pendingInterstitialRef.current = false;
      return;
    }
    if (!ads.interstitialReady()) return;
    pendingInterstitialRef.current = false;
    setAdBusy(true);
    try {
      await ads.showInterstitial();
    } catch {
      // A failed ad must never block the game or the result screen.
    } finally {
      setAdBusy(false);
    }
  }, []);

  // Consent (UMP) and the ad SDK start after the launch screen so the form does not cover it.
  useEffect(() => {
    if (introDone) void ads.initialize();
  }, [introDone]);

  // Audio: load players once, follow settings.
  useEffect(() => {
    audio.setSound(profile.sound);
    audio.setMusic(profile.music);
    if (profile.loaded) {
      audio.setTrack(profile.musicTrack);
      void audio.init();
    }
  }, [profile.sound, profile.music, profile.musicTrack, profile.loaded]);

  useEffect(() => {
    // Turning shadows off applies immediately; turning them on rebuilds the GL view from the menu.
    if (!profile.shadows) engineRef.current?.setShadows(false);
  }, [profile.shadows, glReady]);

  useEffect(() => {
    engineRef.current?.setFpsCap(profile.graphics.fps);
  }, [profile.graphics.fps, glReady]);

  useEffect(() => {
    engineRef.current?.setLook(profile.look);
  }, [profile.look, glReady]);

  useEffect(() => {
    if (mode === "menu") engineRef.current?.setDistrict(profile.progress.current);
  }, [profile.progress.current, glReady, mode]);

  // Quality or shadow changes: rebuild the GL view, but only while the menu is shown.
  useEffect(() => {
    if (!glReady || mode !== "menu" || builtWith.current === null) return;
    if (builtWith.current === graphicsKey()) return;
    engineRef.current?.dispose();
    engineRef.current = null;
    resetSessionShadowMode(profile.graphics.shadows);
    // State changes run in a callback, not in the effect body (avoids cascading renders).
    const timer = setTimeout(() => {
      setGlReady(false);
      setGlKey((k) => k + 1);
    }, 0);
    return () => clearTimeout(timer);
  }, [profile.graphics, glReady, mode, graphicsKey]);

  // Engine callbacks only use refs and stable setters, so one object built when the engine is created stays valid.
  const makeCallbacks = useCallback((): EngineCallbacks => ({
    onHud: (s) => setHud(s),
    onCrash: (r) => {
      setResult(r);
      audio.pauseMusic();
      if (revivesRef.current >= MAX_REVIVES) engineRef.current?.endRun();
      else setMode("crashed");
    },
    onGameOver: async (r) => {
      setResult(r);
      audio.pauseMusic();
      const out = await profileRef.current.recordRun({ ...r, revives: revivesRef.current }, sessionRef.current);
      sessionRef.current = null;
      setIsRecord(out.isRecord);
      setTokenInfo(r.token ? { tokens: out.tokens, unlocked: out.unlocked } : null);
      if (out.isRecord && profileRef.current.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      setMode("gameover");
      void maybeShowInterstitial();
    },
    onEvent: (e: GameEvent) => {
      audio.play(SFX[e]);
      const p = profileRef.current;
      if (e === "key") void p.addKeys(1);
      if (e === "token") showToast(t("token.got"), "boat");
      if ((e === "wings" || e === "carpet" || e === "stumble") && !p.hintsSeen.includes(`ev:${e}`)) {
        showToast(t(e === "wings" ? "power.wingsHint" : e === "carpet" ? "power.carpetHint" : "hint.stumble"), e === "stumble" ? "warning" : "bulb", 3200);
        void p.markHintSeen(`ev:${e}`);
      }
      if (!p.haptics) return;
      if (e === "crash") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      else if (e === "powerup" || e === "shield-break" || e === "key" || e === "token" || e === "wings" || e === "carpet" || e === "stumble")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    },
    onObstacleSeen: (kind) => {
      const p = profileRef.current;
      if (showTutorialRef.current || p.hintsSeen.includes(kind)) return;
      showToast(t(OBSTACLES[kind].hint));
      void p.markHintSeen(kind);
    },
    onBenchmark: (fps) => {
      const g = profileRef.current.graphics;
      if (g.quality === "auto" && !g.autoResolved) void profileRef.current.setGraphics({ autoResolved: pickAutoQuality(fps) });
    },
    onGraphicsFallback: () => {
      const g = profileRef.current.graphics;
      const q = effectiveQuality(g);
      if (!g.unsafe.includes(q)) void profileRef.current.setGraphics({ unsafe: [...g.unsafe, q] });
    },
  }), [maybeShowInterstitial, showToast]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    // Expo GL may recreate its native context when a modal is shown or dismissed.
    // Rebind the renderer on the existing engine instead of losing the run.
    if (engineRef.current) {
      engineRef.current.replaceContext(gl);
    } else {
      const prefs = profileRef.current.graphics;
      const profileForDevice = resolveProfile(prefs, probeCaps(gl as unknown as WebGL2RenderingContext));
      engineRef.current = new RunnerEngine(gl, makeCallbacks(), getSessionShadowMode(prefs.shadows), {
        profile: profileForDevice,
        fps: prefs.fps,
        look: profileRef.current.look,
        benchmark: prefs.quality === "auto" && !prefs.autoResolved && prefs.fps === 60,
      });
      engineRef.current.setDistrict(profileRef.current.progress.current);
      builtWith.current = graphicsKey();
    }
    if (!profileRef.current.shadows) engineRef.current.setShadows(false);
    setGlReady(true);
  }, [graphicsKey, makeCallbacks]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  const beginRun = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const p = profileRef.current;
    setHud(EMPTY_HUD);
    setResult(null);
    setIsRecord(false);
    setTokenInfo(null);
    revivesRef.current = 0;
    setRevives(0);
    setShowTutorial(!p.tutorialSeen);
    sessionRef.current = p.takeRunSession();
    engine.start({ district: p.progress.current, seed: sessionRef.current?.seed, tokenAt: p.tokenAtForRun() });
    setMode("playing");
    audio.startMusic();
    if (p.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  /** Start immediately; interstitials are deferred until the run has ended. */
  const startRun = useCallback(() => {
    beginRun();
    void profileRef.current.registerPlay().then((due) => {
      if (due) pendingInterstitialRef.current = true;
    }).catch(() => undefined);
  }, [beginRun]);

  const reviveNow = useCallback(() => {
    revivesRef.current += 1;
    setRevives(revivesRef.current);
    engineRef.current?.revive();
    audio.startMusic();
    setMode("playing");
  }, []);

  const reviveWithKeys = useCallback(async () => {
    const ok = await profileRef.current.spendKeys(reviveCost(revivesRef.current));
    if (ok) reviveNow();
  }, [reviveNow]);

  const reviveWithAd = useCallback(async () => {
    if (adBusy) return;
    setAdBusy(true);
    try {
      const earned = await ads.showRewarded();
      if (earned) {
        // Grant and spend the revive cost only after the rewarded callback confirms it.
        const cost = reviveCost(revivesRef.current);
        await profileRef.current.addKeys(cost);
        const paid = await profileRef.current.spendKeys(cost);
        if (paid) reviveNow();
      }
    } catch (error) {
      console.warn("[ads] rewarded revive failed", error);
    } finally {
      setAdBusy(false);
    }
  }, [adBusy, reviveNow]);

  const giveUp = useCallback(() => {
    engineRef.current?.endRun();
  }, []);

  const goHome = useCallback(() => {
    engineRef.current?.toMenu();
    audio.pauseMusic();
    setMode("menu");
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    audio.pauseMusic();
    setMode("paused");
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
    if (profileRef.current.music) audio.startMusic();
    else audio.pauseMusic();
    setMode("playing");
  }, []);

  const openRoute = useCallback(
    (path: "/settings" | "/leaderboard" | "/pier" | "/shop" | "/missions") => {
      const currentMode = modeRef.current;
      if (currentMode === "playing") {
        resumeAfterRouteRef.current = true;
        engineRef.current?.pause();
        audio.pauseMusic();
        setMode("paused");
      } else if (currentMode === "paused") {
        resumeAfterRouteRef.current = true;
        audio.pauseMusic();
      } else {
        resumeAfterRouteRef.current = false;
      }
      router.push(path);
    },
    [router],
  );
  const openSettings = useCallback(() => openRoute("/settings"), [openRoute]);

  // Preserve a run while visiting Settings from gameplay or the pause sheet.
  useFocusEffect(
    useCallback(() => {
      if (resumeAfterRouteRef.current && (modeRef.current === "paused" || modeRef.current === "playing")) {
        resumeAfterRouteRef.current = false;
        engineRef.current?.resume();
        setMode("playing");
        if (profileRef.current.music) audio.startMusic();
        else audio.pauseMusic();
      } else if (modeRef.current !== "playing") {
        audio.pauseMusic();
      }

      return () => {
        const modeAtBlur = modeRef.current;
        if (modeAtBlur === "playing") {
          resumeAfterRouteRef.current = true;
          engineRef.current?.pause();
          audio.pauseMusic();
          setMode("paused");
        } else if (modeAtBlur === "paused") {
          resumeAfterRouteRef.current = true;
          audio.pauseMusic();
        } else {
          resumeAfterRouteRef.current = false;
        }
      };
    }, []),
  );

  const dismissTutorial = useCallback(() => {
    setShowTutorial(false);
    void profileRef.current.markTutorialSeen();
  }, []);

  useEffect(() => {
    if (!showTutorial) return;
    const timer = setTimeout(dismissTutorial, 4500);
    return () => clearTimeout(timer);
  }, [showTutorial, dismissTutorial]);

  const sendInput = useCallback(
    (action: GameInput) => {
      if (modeRef.current !== "playing") return;
      engineRef.current?.input(action);
      if (showTutorialRef.current) dismissTutorial();
    },
    [dismissTutorial],
  );

  // Swipes: plain touch handlers on the canvas (a lane change fires as soon as the finger passes SWIPE_PX).
  const swipe = useCallback(
    (dx: number, dy: number) => {
      if (Math.abs(dx) > Math.abs(dy)) sendInput(dx > 0 ? "right" : "left");
      else sendInput(dy < 0 ? "jump" : "roll");
    },
    [sendInput],
  );
  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, fired: false };
  }, []);
  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const t0 = touch.current;
      if (!t0 || t0.fired) return;
      const dx = e.nativeEvent.pageX - t0.x;
      const dy = e.nativeEvent.pageY - t0.y;
      if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
      t0.fired = true;
      swipe(dx, dy);
    },
    [swipe],
  );
  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const t0 = touch.current;
      touch.current = null;
      if (!t0 || t0.fired) return;
      const dx = e.nativeEvent.pageX - t0.x;
      const dy = e.nativeEvent.pageY - t0.y;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      swipe(dx, dy);
    },
    [swipe],
  );

  // Keyboard support for the web preview.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const map: Record<string, GameInput> = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowUp: "jump", w: "jump", " ": "jump", ArrowDown: "roll", s: "roll" };
    const handler = (ev: KeyboardEvent) => {
      const action = map[ev.key];
      if (action) {
        ev.preventDefault();
        sendInput(action);
      } else if (ev.key === "Escape" && modeRef.current === "playing") pause();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sendInput, pause]);

  const missionsReady = (profile.missions?.missions ?? []).filter((m) => !m.claimed && m.progress >= m.target).length;

  const redeem = async () => {
    setConflictMsg(null);
    try {
      await profile.redeemTransferCode(transferCode);
      setTransferCode("");
      setConflictMsg(t("account.transferDone"));
    } catch (e) {
      setConflictMsg(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <View style={styles.root} testID="game-screen">
      <View style={StyleSheet.absoluteFill} testID="game-canvas" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <GLView key={glKey} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      </View>

      {mode === "menu" && introDone ? (
        <MainMenu
          nickname={profile.nickname}
          bestScore={profile.bestScore}
          coins={profile.coins}
          keys={profile.keys}
          adBusy={adBusy}
          district={profile.progress.current}
          onlineCount={profile.onlineCount}
          account={profile.account}
          waking={profile.waking}
          missionsReady={missionsReady}
          onPlay={startRun}
          onLeaderboard={() => openRoute("/leaderboard")}
          onSettings={openSettings}
          onPier={() => openRoute("/pier")}
          onShop={() => openRoute("/shop")}
          onMissions={() => openRoute("/missions")}
          onRetryConnect={() => void profile.retryConnect()}
        />
      ) : null}

      {mode === "playing" || mode === "paused" ? <Hud hud={hud} onPause={pause} /> : null}
      {mode === "playing" && showTutorial ? <TutorialOverlay /> : null}
      {mode === "playing" && toast ? <Toast text={toast.text} icon={toast.icon} /> : null}

      {mode === "paused" ? (
        <Sheet title={t("pause.title")} testID="pause-sheet">
          <Text style={styles.pauseScore}>{t("pause.score", { score: fmt(hud.score) })}</Text>
          <View style={styles.pauseGear}>
            <ChunkyButton testID="pause-settings-button" icon="settings-sharp" round size="lg" variant="neutral" onPress={openSettings} />
          </View>
          <SheetActions>
            <ChunkyButton testID="pause-home-button" label={t("common.home")} icon="home" variant="neutral" onPress={goHome} style={styles.flex} />
            <ChunkyButton testID="pause-resume-button" label={t("common.resume")} icon="play" variant="primary" onPress={resume} style={styles.flex} />
          </SheetActions>
        </Sheet>
      ) : null}

      {mode === "crashed" && result ? (
        <ReviveSheet
          score={result.score}
          cost={reviveCost(revives)}
          keys={profile.keys}
          revivesLeft={MAX_REVIVES - revives}
          adsAvailable={ads.available}
          busy={adBusy}
          onUseKeys={reviveWithKeys}
          onWatchAd={reviveWithAd}
          onGiveUp={giveUp}
        />
      ) : null}

      {mode === "gameover" && result ? (
        <GameOverSheet
          result={result}
          isRecord={isRecord}
          bestScore={profile.bestScore}
          status={profile.lastRun.status}
          serverRecord={profile.lastRun.newRecord}
          tokens={tokenInfo?.tokens ?? null}
          unlocked={tokenInfo?.unlocked ?? null}
          rateAsk={profile.rateAsk}
          onRate={(answer) => void profile.answerRate(answer)}
          onRetry={startRun}
          onHome={goHome}
        />
      ) : null}

      {mode === "menu" && introDone && profile.account === "conflict" ? (
        <Sheet title={t("account.conflictTitle")} testID="account-conflict-sheet">
          <Text style={styles.body}>{t("account.conflictBody")}</Text>
          <TextInput
            testID="conflict-code-input"
            value={transferCode}
            onChangeText={(v) => setTransferCode(v.toUpperCase())}
            placeholder={t("account.codePlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={14}
            style={styles.input}
          />
          {conflictMsg ? <Text style={styles.msg}>{conflictMsg}</Text> : null}
          <ChunkyButton testID="conflict-use-code" label={t("account.useCode")} icon="swap-horizontal" variant="secondary" disabled={transferCode.replace(/[^A-Z0-9]/g, "").length < 12} onPress={redeem} />
          <SheetActions>
            <ChunkyButton testID="conflict-new-profile" label={t("account.newProfile")} icon="person-add" variant="neutral" onPress={() => void profile.resolveConflictNewProfile()} style={styles.flex} />
          </SheetActions>
        </Sheet>
      ) : null}

      {/* Launch screen sits on top of everything until the 3D scene is ready (3–7 s). */}
      {!introDone ? <IntroOverlay ready={glReady && profile.loaded} onDone={() => setIntroDone(true)} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  pauseScore: { fontFamily: fonts.textBold, fontSize: 18, color: colors.onSurface, textAlign: "center", marginBottom: spacing.sm },
  pauseGear: { alignItems: "center" },
  body: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurface },
  msg: { fontFamily: fonts.textBold, fontSize: 13, color: colors.info },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.textBold,
    fontSize: 16,
    letterSpacing: 1.5,
    color: colors.onSurfaceTertiary,
  },
  flex: { flex: 1 },
}));
