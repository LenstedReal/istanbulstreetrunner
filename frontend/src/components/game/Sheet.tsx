import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { makeStyles } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

interface Props {
  title: string;
  testID: string;
  children: React.ReactNode;
}

/** Centered card over a blurred 3D scene (pause & game over). */
export function Sheet({ title, testID, children }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.scrim} testID={testID}>
      <BlurView intensity={Platform.OS === "android" ? 60 : 40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[styles.scrimTint, StyleSheet.absoluteFill]} />
      <Animated.View entering={ZoomIn.springify().damping(16)} style={[styles.card, { marginBottom: insets.bottom }]}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

export function SheetActions({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.actions}>{children}</View>;
}

export { ChunkyButton };

const useStyles = makeStyles((colors) => ({
  scrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  scrimTint: { backgroundColor: colors.scrimLight },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.borderStrong,
    borderBottomWidth: 8,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.onSurface, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
}));
