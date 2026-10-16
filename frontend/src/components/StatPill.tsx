import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View, ViewStyle } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface Props {
  icon?: IconName;
  iconColor?: string;
  leading?: React.ReactNode;
  value: string | number;
  label?: string;
  tone?: "light" | "dark" | "gold" | "red";
  size?: "sm" | "lg";
  testID: string;
  style?: ViewStyle;
}

/** Solid, chunky HUD pill for score / coins / distance. */
export function StatPill({ icon, iconColor, leading, value, label, tone = "light", size = "sm", testID, style }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg = { light: colors.surfaceSecondary, dark: colors.surfaceInverse, gold: colors.brandTertiary, red: colors.brandPrimary }[tone];
  const fg = { light: colors.onSurfaceSecondary, dark: colors.onSurfaceInverse, gold: colors.onBrandTertiary, red: colors.onBrandPrimary }[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg, borderColor: colors.borderStrong }, size === "lg" && styles.pillLg, style]}>
      {leading ?? (icon ? <Ionicons name={icon} size={size === "lg" ? 22 : 18} color={iconColor ?? fg} /> : null)}
      <View>
        {label ? <Text style={[styles.label, { color: fg }]}>{label}</Text> : null}
        <Text style={[styles.value, { color: fg }, size === "lg" && styles.valueLg]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 2.5,
  },
  pillLg: { height: 52, paddingHorizontal: spacing.lg },
  label: { fontFamily: fonts.textBold, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.75 },
  value: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  valueLg: { fontSize: 26, lineHeight: 30 },
}));
