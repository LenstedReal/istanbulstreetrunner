import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useEffect } from "react";
import { Platform, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function Hint({ icon, text, dx, dy, testID }: { icon: IconName; text: string; dx: number; dy: number; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withSequence(withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1);
  }, [t]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * dx }, { translateY: t.value * dy }],
    opacity: 1 - t.value * 0.7,
  }));
  return (
    <View style={styles.hint} testID={testID}>
      <Animated.View style={anim}>
        <Ionicons name={icon} size={44} color={colors.onSurfaceInverse} />
      </Animated.View>
      <Text style={styles.hintText}>{text}</Text>
    </View>
  );
}

/** Semi-transparent swipe tutorial shown over the first seconds of a run. */
export function TutorialOverlay() {
  const styles = useStyles();
  return (
    <View pointerEvents="none" style={styles.scrim} testID="tutorial-overlay">
      <View style={styles.cross}>
        <Hint icon="arrow-up" text="Zıpla" dx={0} dy={-26} testID="tutorial-hint-jump" />
        <View style={styles.midRow}>
          <Hint icon="arrow-back" text="Sola" dx={-26} dy={0} testID="tutorial-hint-left" />
          <View style={styles.center}>
            <Ionicons name="hand-left-outline" size={40} color="#FFFFFF" />
          </View>
          <Hint icon="arrow-forward" text="Sağa" dx={26} dy={0} testID="tutorial-hint-right" />
        </View>
        <Hint icon="arrow-down" text="Eğil" dx={0} dy={26} testID="tutorial-hint-roll" />
      </View>
      <Text style={styles.caption}>{Platform.OS === "web" ? "Kaydır veya ok tuşlarını kullan" : "Ekranda kaydır"}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.scrimLight,
  },
  cross: { alignItems: "center", gap: spacing.md },
  midRow: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
  center: { width: 72, height: 72, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.scrim },
  hint: { alignItems: "center", gap: spacing.xs, width: 84 },
  hintText: { color: colors.onSurfaceInverse, fontFamily: fonts.display, fontSize: 18, textShadowColor: colors.hudShadow, textShadowRadius: 6 },
  caption: {
    marginTop: spacing.xxl,
    color: colors.onSurfaceInverse,
    fontFamily: fonts.textBold,
    fontSize: 14,
    backgroundColor: colors.scrim,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
}));
