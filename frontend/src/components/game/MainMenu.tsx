import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { CoinIcon } from "@/src/components/CoinIcon";
import { StatPill } from "@/src/components/StatPill";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

interface Props {
  nickname: string;
  bestScore: number;
  totalCoins: number;
  keys: number;
  adBusy: boolean;
  onPlay: () => void;
  onLeaderboard: () => void;
  onSettings: () => void;
}

export function MainMenu({ nickname, bestScore, totalCoins, keys, adBusy, onPlay, onLeaderboard, onSettings }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]} testID="main-menu">
      <Animated.View entering={FadeInDown.duration(350)} style={styles.topRow}>
        <View style={styles.pills}>
          <StatPill testID="menu-coins" tone="dark" leading={<CoinIcon size={20} />} value={totalCoins.toLocaleString("tr-TR")} />
          <StatPill testID="menu-keys" tone="light" icon="key" iconColor={colors.brandTertiaryShade} value={keys} />
        </View>
        <StatPill testID="menu-best" tone="dark" icon="trophy" iconColor={colors.brandTertiary} label="En iyi" value={bestScore.toLocaleString("tr-TR")} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.titleBlock}>
        <Text style={styles.title} testID="menu-title">
          ISTANBUL{"\n"}RUNNER
        </Text>
        <View style={styles.nickRow} testID="menu-nickname">
          <Ionicons name="person-circle" size={18} color={colors.onSurfaceInverse} />
          <Text style={styles.nick}>{nickname}</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(160).duration(450)} style={styles.bottom}>
        <ChunkyButton testID="menu-play-button" label={adBusy ? "Reklam yükleniyor…" : "OYNA"} icon="play" size="xl" disabled={adBusy} onPress={onPlay} style={styles.play} />
        <View style={styles.iconRow}>
          <ChunkyButton testID="menu-leaderboard-button" icon="podium" round size="lg" variant="secondary" onPress={onLeaderboard} />
          <ChunkyButton testID="menu-settings-button" icon="settings-sharp" round size="lg" variant="neutral" onPress={onSettings} />
        </View>
        <Text style={styles.hint}>İstanbul temalı semtlerde doyasıya koş</Text>
      </Animated.View>
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
    lineHeight: 60,
    color: colors.onSurfaceInverse,
    textShadowColor: colors.hudShadow,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  nickRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.scrim, paddingHorizontal: spacing.md, height: 30, borderRadius: radius.pill },
  nick: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurfaceInverse },
  bottom: { alignItems: "center", gap: spacing.lg },
  play: { alignSelf: "stretch" },
  iconRow: { flexDirection: "row", gap: spacing.lg },
  hint: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurfaceInverse, textShadowColor: colors.hudShadow, textShadowRadius: 4 },
}));
