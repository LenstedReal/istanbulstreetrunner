import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ads } from "@/src/ads/ads";
import { audio } from "@/src/audio";
import { ChunkyButton } from "@/src/components/ChunkyButton";
import { GameOverSheet } from "@/src/components/game/GameOverSheet";
import { Hud } from "@/src/components/game/Hud";
import { IntroOverlay } from "@/src/components/game/IntroOverlay";
import { MainMenu } from "@/src/components/game/MainMenu";
import { ReviveSheet } from "@/src/components/game/ReviveSheet";
import { Sheet, SheetActions } from "@/src/components/game/Sheet";
import { TutorialOverlay } from "@/src/components/game/TutorialOverlay";
import { EngineCallbacks, GameEvent, GameInput, HudState, RunResult, RunnerEngine } from "@/src/game/engine";
import { MAX_REVIVES, reviveCost, useProfile } from "@/src/profile";
import { makeStyles } from "@/src/theme";
import { fonts, spacing } from "@/src/tokens";

type Mode = "menu" | "playing" | "paused" | "crashed" | "gameover";

const EMPTY_HUD: HudState = { score: 0, coins: 0, keys: 0, multiplier: 1, distance: 0, speedKmh: 0, powerup: null, shield: false };
const SWIPE_PX = 26;

export default function GameScreen() {
  const styles = useStyles();
  const router = useRouter();
  const profile = useProfile();

  const [mode, setMode] = useState<Mode>("menu");
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRecord, setIsRecord] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [glReady, setGlReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [revives, setRevives] = useState(0);
  const [adBusy, setAdBusy] = useState(false);

  const engineRef = useRef<RunnerEngine | null>(null);
  const modeRef = useRef<Mode>("menu");
  modeRef.current = mode;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const revivesRef = useRef(0);
  const resumeAfterRouteRef = useRef(false);
  const pendingInterstitialRef = useRef(false);

  const maybeShowInterstitial = useCallback(async () => {
    if (!pendingInterstitialRef.current) return;
    if (profileRef.current.adFree || !ads.available) {
      pendingInterstitialRef.current = false;
      return;
    }
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

  useEffect(() => {
    void ads.initialize();
  }, []);

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
    engineRef.current?.setShadows(profile.shadows);
  }, [profile.shadows, glReady]);

  // Callbacks object is mutable so the engine always sees the latest closures.
  const callbacks = useRef<EngineCallbacks>({
    onHud: (s) => setHud(s),
    onCrash: (r) => {
      setResult(r);
      audio.pauseMusic();
      // Out of revives for this run -> straight to the result sheet.
      if (revivesRef.current >= MAX_REVIVES) engineRef.current?.endRun();
      else setMode("crashed");
    },
    onGameOver: async (r) => {
      setResult(r);
      audio.pauseMusic();
      const { isRecord: rec } = await profileRef.current.recordRun(r);
      setIsRecord(rec);
      if (rec && profileRef.current.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      setMode("gameover");
      void maybeShowInterstitial();
    },
    onEvent: (e: GameEvent) => {
      const sfx = { crash: "crash", coin: "coin", key: "powerup", jump: "jump", roll: "roll", lane: "swipe", powerup: "powerup", "shield-break": "shield" } as const;
      audio.play(sfx[e]);
      if (e === "key") void profileRef.current.addKeys(1);
      if (!profileRef.current.haptics) return;
      if (e === "crash") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      else if (e === "powerup" || e === "shield-break" || e === "key") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    },
  });

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    engineRef.current?.dispose();
    engineRef.current = new RunnerEngine(gl, callbacks.current);
    engineRef.current.setShadows(profileRef.current.shadows);
    setGlReady(true);
  }, []);

  useEffect(() => () => engineRef.current?.dispose(), []);

  const beginRun = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setHud(EMPTY_HUD);
    setResult(null);
    setIsRecord(false);
    revivesRef.current = 0;
    setRevives(0);
    setShowTutorial(!profileRef.current.tutorialSeen);
    engine.start();
    setMode("playing");
    audio.startMusic();
    if (profileRef.current.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  /** Start immediately; interstitials are deferred until the run has ended. */
  const startRun = useCallback(() => {
    beginRun();
    void profileRef.current.registerPlay().then((due) => {
      if (!due) return;
      pendingInterstitialRef.current = true;
      if (modeRef.current === "gameover") void maybeShowInterstitial();
    }).catch(() => undefined);
  }, [beginRun, maybeShowInterstitial]);

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

  // Set the return intent synchronously before navigation starts. Relying only
  // on the focus-effect cleanup can race the native stack transition, leaving
  // the engine paused without a matching resume when Settings closes.
  const openSettings = useCallback(() => {
    const currentMode = modeRef.current;
    if (currentMode === "playing") {
      engineRef.current?.pause();
      audio.pauseMusic();
      setMode("paused");
      resumeAfterRouteRef.current = true;
    } else if (currentMode === "paused") {
      resumeAfterRouteRef.current = true;
      audio.pauseMusic();
    } else {
      resumeAfterRouteRef.current = false;
    }
    router.push("/settings");
  }, [router]);

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
          // Settings opened from the pause sheet: resume the same run on return.
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
    const t = setTimeout(dismissTutorial, 4500);
    return () => clearTimeout(t);
  }, [showTutorial, dismissTutorial]);

  const sendInput = useCallback(
    (action: GameInput) => {
      if (modeRef.current !== "playing") return;
      engineRef.current?.input(action);
      if (showTutorial) dismissTutorial();
    },
    [showTutorial, dismissTutorial],
  );

  const fired = useRef(false);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(8)
    .onBegin(() => {
      fired.current = false;
    })
    .onUpdate((e) => {
      if (fired.current) return;
      const { translationX: dx, translationY: dy } = e;
      if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
      fired.current = true;
      if (Math.abs(dx) > Math.abs(dy)) sendInput(dx > 0 ? "right" : "left");
      else sendInput(dy < 0 ? "jump" : "roll");
    })
    .onEnd((e) => {
      if (fired.current) return;
      const { translationX: dx, translationY: dy } = e;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      fired.current = true;
      if (Math.abs(dx) > Math.abs(dy)) sendInput(dx > 0 ? "right" : "left");
      else sendInput(dy < 0 ? "jump" : "roll");
    });

  // Keyboard support for the web preview.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const map: Record<string, GameInput> = {
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
      ArrowUp: "jump",
      w: "jump",
      " ": "jump",
      ArrowDown: "roll",
      s: "roll",
    };
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

  return (
    <View style={styles.root} testID="game-screen">
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} testID="game-canvas">
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        </View>
      </GestureDetector>

      {mode === "menu" && introDone ? (
        <MainMenu
          nickname={profile.nickname}
          bestScore={profile.bestScore}
          totalCoins={profile.totalCoins}
          keys={profile.keys}
          adBusy={adBusy}
          onPlay={startRun}
          onLeaderboard={() => router.push("/leaderboard")}
          onSettings={openSettings}
        />
      ) : null}

      {mode === "playing" || mode === "paused" ? <Hud hud={hud} onPause={pause} /> : null}
      {mode === "playing" && showTutorial ? <TutorialOverlay /> : null}

      {mode === "paused" ? (
        <Sheet title="Duraklatıldı" testID="pause-sheet">
          <Text style={styles.pauseScore}>Skor: {hud.score.toLocaleString("tr-TR")}</Text>
          <View style={styles.pauseGear}>
            <ChunkyButton testID="pause-settings-button" icon="settings-sharp" round size="lg" variant="neutral" onPress={openSettings} />
          </View>
          <SheetActions>
            <ChunkyButton testID="pause-home-button" label="Ana Menü" icon="home" variant="neutral" onPress={goHome} style={styles.flex} />
            <ChunkyButton testID="pause-resume-button" label="Devam" icon="play" variant="primary" onPress={resume} style={styles.flex} />
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
        <GameOverSheet result={result} isRecord={isRecord} bestScore={profile.bestScore} onRetry={startRun} onHome={goHome} />
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
  flex: { flex: 1 },
}));
