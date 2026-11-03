import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Short banner under the HUD for first-time hints and pick-ups. */
export function Toast({ text, icon = "bulb", testID = "game-toast" }: { text: string; icon?: IconName; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(200)} style={[styles.root, { top: insets.top + 132 }]} pointerEvents="none" testID={testID}>
      <Ionicons name={icon} size={20} color={colors.brandTertiaryShade} />
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.borderStrong,
    borderWidth: 2.5,
    borderBottomWidth: 5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  text: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary, flexShrink: 1 },
}));
