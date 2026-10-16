// Design tokens for this app. Light theme only.Always modify the colors and theme to Dark, Light or Dark and Light according to the design guidelines.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // ---------------------------------------------------------------------------
  // Surfaces: backgrounds, from the screen down to small fills.
  // Each `on` key is the text and icon color for that background.
  // ---------------------------------------------------------------------------
  surface: "#FDFBF7", // primary canvas, most of every screen
  onSurface: "#2A2626", // text and icons on the canvas
  surfaceSecondary: "#FFFFFF", // cards, sheets, list rows
  onSurfaceSecondary: "#2A2626", // text and icons on cards, sheets, rows
  surfaceTertiary: "#F4EFE6", // input backgrounds, chips, deepest nesting
  onSurfaceTertiary: "#2A2626", // text on inputs and chips; also muted text
  surfaceInverse: "#2A2626", // tooltips, snackbars, anything popping against the theme
  onSurfaceInverse: "#FFFFFF", // text and icons on the inverse surface
  muted: "#8C867C", // subdued text on surface: captions, timestamps, placeholders

  // ---------------------------------------------------------------------------
  // Brand: Ottoman red, Galata gold, warm orange.
  // ---------------------------------------------------------------------------
  brand: "#D62828",
  onBrand: "#FFFFFF",
  brandPrimary: "#D62828", // primary CTA (Oyna)
  onBrandPrimary: "#FFFFFF",
  brandPrimaryShade: "#9A1B1B", // tactile bottom edge of primary buttons
  brandSecondary: "#F4A261",
  onBrandSecondary: "#2A2626",
  brandTertiary: "#E9C46A", // coins, record badges
  onBrandTertiary: "#2A2626",
  brandTertiaryShade: "#B8923A",

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------
  success: "#43A047",
  onSuccess: "#FFFFFF",
  warning: "#FFB300",
  onWarning: "#2A2626",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#00A8CC", // Bosphorus blue, secondary actions
  onInfo: "#FFFFFF",
  infoShade: "#007A94",

  // ---------------------------------------------------------------------------
  // Lines
  // ---------------------------------------------------------------------------
  border: "#E0DCD6",
  borderStrong: "#2A2626", // chunky outlines on pills & buttons
  divider: "#E0DCD6",

  // ---------------------------------------------------------------------------
  // Game specific
  // ---------------------------------------------------------------------------
  scrim: "rgba(42, 38, 38, 0.55)", // behind sheets over the 3D scene
  scrimLight: "rgba(42, 38, 38, 0.25)",
  hudText: "#FFFFFF",
  hudShadow: "rgba(0,0,0,0.45)",
  gold: "#E9C46A",
  silver: "#C0C4CC",
  bronze: "#CD8B5B",
  magnet: "#D62828",
  shield: "#00A8CC",
  doubler: "#E9C46A",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// In-app theme toggle, only after `dark` exists in `themes`. Call
// setColorScheme("dark"), setColorScheme("light"), or setColorScheme(null) to
// follow the device. Every useTheme() consumer re-renders. Persisting the
// choice and re-applying it on launch is the toggle's job.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces (alerts, pickers, navigation chrome) on the schemes this
// app ships: light only forces light; once `dark` exists the device decides.
// Optional call because react-native-web does not implement it.
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}


