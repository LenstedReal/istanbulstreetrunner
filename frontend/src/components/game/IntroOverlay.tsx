import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { makeStyles } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

const MIN_MS = 3000; // never shorter than 3 s
const MAX_MS = 7000; // never longer than 7 s, even on a slow device
const TIPS = ["Koşucu yükleniyor…", "Nesneler yükleniyor…", "Hazırlanıyor…"];

interface Props {
  ready: boolean;
  onDone: () => void;
}

/** Animated launch screen: logo drop-in, progress bar and a rotating tip. */
export function IntroOverlay({ ready, onDone }: Props) {
  const styles = useStyles();
  const start = useRef(Date.now());
  const [tip, setTip] = useState(0);
  const logo = useSharedValue(0);
  const pulse = useSharedValue(1);
  const progress = useSharedValue(0);
  const doneRef = useRef(false);

  useEffect(() => {
    logo.value = withSpring(1, { damping: 12, stiffness: 120 });
    pulse.value = withDelay(600, withRepeat(withSequence(withTiming(1.04, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) })), -1));
    // Slow fill while loading; it is pushed to 100 % once the scene is ready.
    progress.value = withTiming(0.8, { duration: MAX_MS, easing: Easing.out(Easing.cubic) });
    const tipTimer = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 1800);
    return () => clearInterval(tipTimer);
  }, [logo, pulse, progress]);

  useEffect(() => {
    if (doneRef.current) return;
    const elapsed = Date.now() - start.current;
    const wait = ready ? Math.max(MIN_MS - elapsed, 0) : Math.max(MAX_MS - elapsed, 0);
    const t = setTimeout(() => {
      doneRef.current = true;
      progress.value = withTiming(1, { duration: 350 });
      setTimeout(onDone, 450);
    }, wait);
    return () => clearTimeout(t);
  }, [ready, onDone, progress]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ translateY: (1 - logo.value) * -60 }, { scale: logo.value * pulse.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.round(progress.value * 100)}%` }));

  return (
    <Animated.View exiting={FadeOut.duration(400)} style={styles.root} testID="intro-overlay">
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image source={require("../../../assets/images/icon.png")} style={styles.logo} contentFit="contain" />
      </Animated.View>
      <Text style={styles.title} testID="intro-title">
        ISTANBUL{"\n"}RUNNER
      </Text>
      <View style={styles.bottom}>
        <View style={styles.track} testID="intro-progress">
          <Animated.View style={[styles.fill, barStyle]} />
        </View>
        <Text style={styles.tip} testID="intro-tip">
          {TIPS[tip]}
        </Text>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.surfaceInverse,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  logoWrap: { width: 160, height: 160, borderRadius: 36, overflow: "hidden" },
  logo: { width: 160, height: 160 },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.onSurfaceInverse, textAlign: "center", letterSpacing: 1 },
  bottom: { position: "absolute", bottom: 72, left: spacing.xxl, right: spacing.xxl, alignItems: "center", gap: spacing.md },
  track: { width: "100%", height: 10, borderRadius: radius.pill, backgroundColor: colors.hudShadow, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.brandPrimary },
  tip: { fontFamily: fonts.textBold, fontSize: 13, color: colors.muted, textAlign: "center" },
}));
