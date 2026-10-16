import React from "react";
import { View } from "react-native";

import { makeStyles } from "@/src/theme";

/** Flat gold coin glyph used in HUD pills (reads better than a plain dot). */
export function CoinIcon({ size = 20 }: { size?: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.outer, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.12) }]}>
      <View style={[styles.inner, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, borderWidth: Math.max(1.5, size * 0.08) }]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  outer: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiaryShade, alignItems: "center", justifyContent: "center" },
  inner: { borderColor: colors.brandTertiaryShade, backgroundColor: colors.brandTertiary },
}));
