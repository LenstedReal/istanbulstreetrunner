import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatPill } from "@/src/components/StatPill";
import type { HudState } from "@/src/game/engine";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

interface Props {
  hud: HudState;
  onPause: () => void;
}

export function Hud({ hud, onPause }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pu = hud.powerup;
  const progress = pu ? Math.max(0, pu.remaining / pu.total) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]} testID="game-hud">
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <StatPill testID="hud-score" tone="dark" value={hud.score.toLocaleString("tr-TR")} label="Skor" size="lg" />
          <StatPill testID="hud-distance" tone="light" icon="speedometer-outline" value={`${hud.distance} m`} />
        </View>
        <View style={styles.rightCol}>
          <Pressable testID="hud-pause-button" accessibilityRole="button" onPress={onPause} style={[styles.pause, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderStrong }]}>
            <Ionicons name="pause" size={24} color={colors.onSurfaceSecondary} />
          </Pressable>
          <StatPill testID="hud-coins" tone="gold" icon="ellipse" iconColor={colors.brandTertiaryShade} value={hud.coins} />
        </View>
      </View>

      <View style={styles.statusRow}>
        {hud.multiplier > 1 ? (
          <View style={[styles.badge, { backgroundColor: colors.brandTertiary, borderColor: colors.borderStrong }]} testID="hud-multiplier">
            <Text style={[styles.badgeText, { color: colors.onBrandTertiary }]}>x2</Text>
          </View>
        ) : null}
        {hud.shield ? (
          <View style={[styles.badge, { backgroundColor: colors.info, borderColor: colors.borderStrong }]} testID="hud-shield">
            <Ionicons name="shield-checkmark" size={18} color={colors.onInfo} />
          </View>
        ) : null}
        {pu ? (
          <View style={[styles.powerBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderStrong }]} testID="hud-powerup">
            <Ionicons name={pu.kind === "magnet" ? "magnet" : "flash"} size={18} color={pu.kind === "magnet" ? colors.magnet : colors.brandTertiaryShade} />
            <View style={[styles.track, { backgroundColor: colors.surfaceTertiary }]}>
              <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: pu.kind === "magnet" ? colors.magnet : colors.brandTertiary }]} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: spacing.lg, gap: spacing.md, pointerEvents: "box-none" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  leftCol: { gap: spacing.sm, alignItems: "flex-start" },
  rightCol: { gap: spacing.sm, alignItems: "flex-end" },
  pause: { width: 48, height: 48, borderRadius: radius.pill, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { height: 36, minWidth: 36, paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.display, fontSize: 16 },
  powerBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 2.5, width: 150 },
  track: { flex: 1, height: 10, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
}));
