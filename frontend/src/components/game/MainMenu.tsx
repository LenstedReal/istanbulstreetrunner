import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { CoinIcon } from "@/src/components/CoinIcon";
import { StatPill } from "@/src/components/StatPill";
import { DISTRICTS, type DistrictId } from "@/src/game/districts";
import { fmt, useT } from "@/src/i18n";
import type { AccountState } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

interface Props {
  nickname: string;
  bestScore: number;
  coins: number;
  keys: number;
  adBusy: boolean;
  district: DistrictId;
  /** 1-based level of the district. */
  level: number;
  /** Goal of the current district, or null when it is already done. */
  goal: { distance: number; coins: number } | null;
  onlineCount: number | null;
  account: AccountState;
  waking: boolean;
  missionsReady: number;
  onPlay: () => void;
  onLeaderboard: () => void;
  onSettings: () => void;
  onPier: () => void;
  onShop: () => void;
  onMissions: () => void;
  onRetryConnect: () => void;
}

export function MainMenu(p: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]} testID="main-menu">
      <Animated.View entering={FadeInDown.duration(350)} style={styles.topRow}>
        <View style={styles.pills}>
          <StatPill testID="menu-coins" tone="dark" leading={<CoinIcon size={20} />} value={fmt(p.coins)} />
          <StatPill testID="menu-keys" tone="light" icon="key" iconColor={colors.brandTertiaryShade} value={p.keys} />
        </View>
        <StatPill testID="menu-best" tone="dark" icon="trophy" iconColor={colors.brandTertiary} label={t("menu.best")} value={fmt(p.bestScore)} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.titleBlock}>
        <Text style={styles.title} testID="menu-title">
          {t("menu.titleTop")}
          {"\n"}
          <Text style={styles.titleSmall}>{t("menu.titleBottom")}</Text>
        </Text>
        <View style={styles.chipRow}>
          <View style={styles.chip} testID="menu-nickname">
            <Ionicons name="person-circle" size={18} color={colors.onSurfaceInverse} />
            <Text style={styles.chipText}>{p.nickname}</Text>
          </View>
          <Pressable style={styles.chip} onPress={p.onPier} testID="menu-district" accessibilityRole="button">
            <Ionicons name="location" size={16} color={colors.onSurfaceInverse} />
            <Text style={styles.chipText}>
              {t("level.n", { n: p.level })} · {t(DISTRICTS[p.district].name)}
            </Text>
          </Pressable>
        </View>
        {p.goal ? (
          <Pressable style={[styles.chip, styles.goalChip]} onPress={p.onPier} testID="menu-goal" accessibilityRole="button">
            <Ionicons name="flag" size={16} color={colors.onBrandTertiary} />
            <Text style={[styles.chipText, { color: colors.onBrandTertiary }]}>{t("goal.short", { distance: fmt(p.goal.distance), coins: fmt(p.goal.coins) })}</Text>
          </Pressable>
        ) : null}
        {p.account === "online" && p.onlineCount !== null && p.onlineCount > 0 ? (
          <View style={styles.chip} testID="menu-online">
            <View style={styles.dot} />
            <Text style={styles.chipText}>{t("menu.online", { count: fmt(p.onlineCount) })}</Text>
          </View>
        ) : p.waking ? (
          <View style={styles.chip}>
            <Ionicons name="cloud-outline" size={16} color={colors.onSurfaceInverse} />
            <Text style={styles.chipText}>{t("board.waking")}</Text>
          </View>
        ) : p.account === "offline" ? (
          <Pressable style={styles.chip} onPress={p.onRetryConnect} testID="menu-offline" accessibilityRole="button">
            <Ionicons name="cloud-offline-outline" size={16} color={colors.onSurfaceInverse} />
            <Text style={styles.chipText}>
              {t("menu.offline")} · {t("menu.retry")}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(160).duration(450)} style={styles.bottom}>
        <ChunkyButton testID="menu-play-button" label={p.adBusy ? t("menu.adLoading") : t("menu.play")} icon="play" size="xl" disabled={p.adBusy} onPress={p.onPlay} style={styles.play} />
        <View style={styles.iconRow}>
          <MenuIcon label={t("menu.pier")}>
            <ChunkyButton testID="menu-pier-button" icon="boat" round size="lg" variant="secondary" onPress={p.onPier} />
          </MenuIcon>
          <MenuIcon label={t("menu.shop")}>
            <ChunkyButton testID="menu-shop-button" icon="shirt" round size="lg" variant="gold" onPress={p.onShop} />
          </MenuIcon>
          <MenuIcon label={t("menu.missions")} badge={p.missionsReady}>
            <ChunkyButton testID="menu-missions-button" icon="checkmark-done" round size="lg" variant="secondary" onPress={p.onMissions} />
          </MenuIcon>
          <MenuIcon label={t("board.title")}>
            <ChunkyButton testID="menu-leaderboard-button" icon="podium" round size="lg" variant="secondary" onPress={p.onLeaderboard} />
          </MenuIcon>
          <MenuIcon label={t("settings.title")}>
            <ChunkyButton testID="menu-settings-button" icon="settings-sharp" round size="lg" variant="neutral" onPress={p.onSettings} />
          </MenuIcon>
        </View>
        <Text style={styles.hint}>{t("menu.tagline")}</Text>
      </Animated.View>
    </View>
  );
}

function MenuIcon({ label, badge, children }: { label: string; badge?: number; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.menuIcon}>
      {children}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.menuLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, paddingHorizontal: spacing.lg, justifyContent: "space-between", pointerEvents: "box-none" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pills: { flexDirection: "row", gap: spacing.sm },
  titleBlock: { alignItems: "flex-start", gap: spacing.sm },
  title: {
    fontFamily: fonts.display,
    fontSize: 58,
    lineHeight: 72,
    paddingTop: 6,
    includeFontPadding: true,
    color: colors.onSurfaceInverse,
    textShadowColor: colors.hudShadow,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  titleSmall: { fontSize: 36, lineHeight: 46, color: colors.brandTertiary },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.scrim, paddingHorizontal: spacing.md, height: 30, borderRadius: radius.pill },
  chipText: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurfaceInverse },
  goalChip: { backgroundColor: colors.brandTertiary, alignSelf: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  bottom: { alignItems: "center", gap: spacing.lg },
  play: { alignSelf: "stretch" },
  iconRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", flexWrap: "wrap" },
  menuIcon: { alignItems: "center", gap: 4, width: 64 },
  menuLabel: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSurfaceInverse, textShadowColor: colors.hudShadow, textShadowRadius: 4 },
  badge: { position: "absolute", top: -4, right: 2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.onSurfaceInverse },
  badgeText: { fontFamily: fonts.textHeavy, fontSize: 11, color: colors.onBrandPrimary },
  hint: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurfaceInverse, textShadowColor: colors.hudShadow, textShadowRadius: 4 },
}));
