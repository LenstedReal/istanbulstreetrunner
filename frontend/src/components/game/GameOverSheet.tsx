import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View } from "react-native";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { CoinIcon } from "@/src/components/CoinIcon";
import { Sheet, SheetActions } from "@/src/components/game/Sheet";
import { DISTRICTS, type DistrictId } from "@/src/game/districts";
import type { RunResult } from "@/src/game/engine";
import { fmt, useT } from "@/src/i18n";
import type { RunStatus } from "@/src/profile";
import { TOKENS_PER_DISTRICT } from "@/src/progress";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

interface Props {
  result: RunResult;
  isRecord: boolean;
  bestScore: number;
  status: RunStatus;
  serverRecord: boolean;
  /** Token pieces now held in this district (shown when one was collected). */
  tokens: number | null;
  unlocked: DistrictId | null;
  rateAsk?: boolean;
  onRate?: (answer: "rate" | "later" | "never") => void;
  onRetry: () => void;
  onHome: () => void;
}

export function GameOverSheet({ result, isRecord, bestScore, status, serverRecord, tokens, unlocked, rateAsk, onRate, onRetry, onHome }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const note =
    status === "pending" ? t("over.pending") : status === "ranked" ? (serverRecord ? t("over.newServerRecord") : t("over.ranked")) : status === "queued" ? t("over.queued") : status === "flagged" ? t("over.flagged") : status === "notRanked" ? t("over.notRanked") : null;
  return (
    <Sheet title={result.reason === "caught" ? t("over.caught") : t("over.crashed")} testID="game-over-sheet">
      {isRecord ? (
        <View style={styles.record} testID="new-record-badge">
          <Ionicons name="trophy" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.recordText}>{t("over.record")}</Text>
        </View>
      ) : null}
      <View style={styles.scoreBlock}>
        <Text style={styles.scoreLabel}>{t("over.score")}</Text>
        <Text style={styles.score} testID="game-over-score">
          {fmt(result.score)}
        </Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat} testID="game-over-coins">
          <CoinIcon size={20} />
          <Text style={styles.statValue}>{result.coins}</Text>
          <Text style={styles.statLabel}>{t("over.coins")}</Text>
        </View>
        <View style={styles.stat} testID="game-over-distance">
          <Ionicons name="speedometer-outline" size={18} color={colors.info} />
          <Text style={styles.statValue}>{result.distance} m</Text>
          <Text style={styles.statLabel}>{t("over.distance")}</Text>
        </View>
        <View style={styles.stat} testID="game-over-best">
          <Ionicons name="star" size={18} color={colors.brandPrimary} />
          <Text style={styles.statValue}>{fmt(bestScore)}</Text>
          <Text style={styles.statLabel}>{t("over.best")}</Text>
        </View>
      </View>
      {tokens !== null ? (
        <View style={styles.token} testID="game-over-token">
          <Ionicons name="boat" size={18} color={colors.info} />
          <Text style={styles.tokenText}>
            {unlocked ? t("pier.unlocked", { name: t(DISTRICTS[unlocked].name) }) : t("over.token", { have: Math.min(tokens, TOKENS_PER_DISTRICT) })}
          </Text>
        </View>
      ) : null}
      {rateAsk && onRate ? (
        <View style={styles.rate} testID="game-over-rate">
          <Text style={styles.rateTitle}>{t("rate.title")}</Text>
          <Text style={styles.note}>{t("rate.body")}</Text>
          <View style={styles.rateRow}>
            <ChunkyButton testID="rate-yes" label={t("rate.yes")} icon="star" variant="gold" onPress={() => onRate("rate")} style={styles.flex} />
            <ChunkyButton testID="rate-later" label={t("rate.later")} variant="neutral" onPress={() => onRate("later")} style={styles.flex} />
          </View>
          <Text style={styles.rateNever} onPress={() => onRate("never")} testID="rate-never">
            {t("rate.never")}
          </Text>
        </View>
      ) : null}
      {note ? (
        <Text style={styles.note} testID="game-over-note">
          {note}
        </Text>
      ) : null}
      <SheetActions>
        <ChunkyButton testID="game-over-home-button" label={t("common.home")} icon="home" variant="neutral" onPress={onHome} style={styles.flex} />
        <ChunkyButton testID="game-over-retry-button" label={t("common.retry")} icon="refresh" variant="primary" onPress={onRetry} style={styles.flex} />
      </SheetActions>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  record: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.brandTertiary,
    borderColor: colors.borderStrong,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 34,
  },
  recordText: { fontFamily: fonts.display, fontSize: 16, color: colors.onBrandTertiary },
  scoreBlock: { alignItems: "center" },
  scoreLabel: { fontFamily: fonts.textHeavy, fontSize: 12, letterSpacing: 2, color: colors.muted },
  score: { fontFamily: fonts.display, fontSize: 64, lineHeight: 70, color: colors.brandPrimary },
  statsRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurfaceTertiary },
  statLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  token: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm },
  tokenText: { fontFamily: fonts.textHeavy, fontSize: 14, color: colors.onSurfaceTertiary, flexShrink: 1 },
  rate: { gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md },
  rateTitle: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceTertiary, textAlign: "center" },
  rateRow: { flexDirection: "row", gap: spacing.sm },
  rateNever: { fontFamily: fonts.textBold, fontSize: 12, color: colors.muted, textAlign: "center", textDecorationLine: "underline" },
  note: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, textAlign: "center" },
  flex: { flex: 1 },
}));
