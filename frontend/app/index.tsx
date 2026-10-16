import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { GameOverSheet } from "@/src/components/game/GameOverSheet";
import { Hud } from "@/src/components/game/Hud";
import { IntroOverlay } from "@/src/components/game/IntroOverlay";
import { MainMenu } from "@/src/components/game/MainMenu";
import { Sheet, SheetActions } from "@/src/components/game/Sheet";
import { TutorialOverlay } from "@/src/components/game/TutorialOverlay";
import { audio } from "@/src/audio";
import { EngineCallbacks, GameEvent, GameInput, HudState, RunResult, RunnerEngine } from "@/src/game/engine";
import { useProfile } from "@/src/profile";
import { makeStyles } from "@/src/theme";
import { fonts, spacing } from "@/src/tokens";

type Mode = "menu" | "playing" | "paused" | "gameover";

const EMPTY_HUD: HudState = { score: 0, coins: 0, multiplier: 1, distance: 0, speedKmh: 0, powerup: null, shield: false };
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

  const engineRef = useRef<RunnerEngine | null>(null);
  const modeRef = useRef<Mode>("menu");
  modeRef.current = mode;
  const profileRef = useRef(profile);
  profileRef.current = profile;

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
    onGameOver: async (r) => {
      setResult(r);
      audio.duckMusic();
      const { isRecord: rec } = await profileRef.current.recordRun(r);
      setIsRecord(rec);
      if (rec && profileRef.current.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
      setMode("gameover");
    },
    onEvent: (e: GameEvent) => {
      const sfx = { crash: "crash", coin: "coin", jump: "jump", roll: "roll", lane: "swipe", powerup: "powerup", "shield-break": "shield" } as const;
      audio.play(sfx[e]);
      if (!profileRef.current.haptics) return;
      if (e === "crash") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      else if (e === "powerup" || e === "shield-break") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
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

  const startRun = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setHud(EMPTY_HUD);
    setResult(null);
    setIsRecord(false);
    setShowTutorial(!profileRef.current.tutorialSeen);
    engine.start();
    setMode("playing");
    audio.startMusic();
    if (profileRef.current.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
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
    audio.startMusic();
    setMode("playing");
  }, []);

  // Pause automatically when the screen loses focus (navigating to leaderboard/settings).
  useFocusEffect(
    useCallback(() => {
      // Coming back from Settings (track preview) or Leaderboard: music only plays during a run.
      if (modeRef.current !== "playing") audio.pauseMusic();
      return () => {
        if (modeRef.current === "playing") {
          engineRef.current?.pause();
          audio.pauseMusic();
          setMode("paused");
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
          onPlay={startRun}
          onLeaderboard={() => router.push("/leaderboard")}
          onSettings={() => router.push("/settings")}
        />
      ) : null}

      {mode === "playing" || mode === "paused" ? <Hud hud={hud} onPause={pause} /> : null}
      {mode === "playing" && showTutorial ? <TutorialOverlay /> : null}

      {mode === "paused" ? (
        <Sheet title="Duraklatıldı" testID="pause-sheet">
          <Text style={styles.pauseScore}>Skor: {hud.score.toLocaleString("tr-TR")}</Text>
          <SheetActions>
            <ChunkyButton testID="pause-home-button" label="Ana Menü" icon="home" variant="neutral" onPress={goHome} style={styles.flex} />
            <ChunkyButton testID="pause-resume-button" label="Devam" icon="play" variant="primary" onPress={resume} style={styles.flex} />
          </SheetActions>
        </Sheet>
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
  flex: { flex: 1 },
}));
