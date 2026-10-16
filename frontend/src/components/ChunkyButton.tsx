import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, Text, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Variant = "primary" | "secondary" | "neutral" | "gold";

interface Props {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  variant?: Variant;
  size?: "md" | "lg" | "xl";
  round?: boolean;
  disabled?: boolean;
  testID: string;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Chunky arcade button with a thick bottom edge that depresses on touch. */
export function ChunkyButton({ label, icon, onPress, variant = "primary", size = "md", round, disabled, testID, style }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const pressed = useSharedValue(0);

  const palette = {
    primary: { bg: colors.brandPrimary, edge: colors.brandPrimaryShade, fg: colors.onBrandPrimary },
    secondary: { bg: colors.info, edge: colors.infoShade, fg: colors.onInfo },
    neutral: { bg: colors.surfaceSecondary, edge: colors.borderStrong, fg: colors.onSurfaceSecondary },
    gold: { bg: colors.brandTertiary, edge: colors.brandTertiaryShade, fg: colors.onBrandTertiary },
  }[variant];

  const edge = size === "xl" ? 7 : size === "lg" ? 6 : 5;
  const height = size === "xl" ? 76 : size === "lg" ? 60 : 52;
  const fontSize = size === "xl" ? 30 : size === "lg" ? 22 : 17;
  const iconSize = size === "xl" ? 30 : size === "lg" ? 24 : 20;

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * edge * 0.8 }, { scale: 1 - pressed.value * 0.02 }],
    borderBottomWidth: edge * (1 - pressed.value * 0.8),
  }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() => (pressed.value = withTiming(1, { duration: 70 }))}
      onPressOut={() => (pressed.value = withSpring(0, { damping: 14, stiffness: 260 }))}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: palette.bg,
          borderBottomColor: palette.edge,
          borderColor: colors.borderStrong,
          height,
          minWidth: round ? height : undefined,
          width: round ? height : undefined,
          paddingHorizontal: round ? 0 : size === "xl" ? spacing.xxl : spacing.xl,
          borderRadius: round ? radius.pill : size === "xl" ? radius.lg : radius.md,
          opacity: disabled ? 0.55 : 1,
        },
        anim,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <Ionicons name={icon} size={iconSize} color={palette.fg} /> : null}
        {label ? <Text style={[styles.label, { color: palette.fg, fontSize }]}>{label}</Text> : null}
      </View>
    </AnimatedPressable>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fonts.display, letterSpacing: 0.5 },
}));
