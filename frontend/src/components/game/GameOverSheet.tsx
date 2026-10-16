import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View } from "react-native";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { CoinIcon } from "@/src/components/CoinIcon";
import { Sheet, SheetActions } from "@/src/components/game/Sheet";
import type { RunResult } from "@/src/game/engine";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

interface Props {
  result: RunResult;
  isRecord: boolean;
  bestScore: number;
  onRetry: () => void;
  onHome: () => void;
}

export function GameOverSheet({ result, isRecord, bestScore, onRetry, onHome }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Sheet title="Çarptın!" testID="game-over-sheet">
      {isRecord ? (
        <View style={styles.record} testID="new-record-badge">
          <Ionicons name="trophy" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.recordText}>Yeni Rekor!</Text>
        </View>
      ) : null}
      <View style={styles.scoreBlock}>
        <Text style={styles.scoreLabel}>SKOR</Text>
        <Text style={styles.score} testID="game-over-score">
          {result.score.toLocaleString("tr-TR")}
        </Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat} testID="game-over-coins">
          <CoinIcon size={20} />
          <Text style={styles.statValue}>{result.coins}</Text>
          <Text style={styles.statLabel}>altın</Text>
        </View>
        <View style={styles.stat} testID="game-over-distance">
          <Ionicons name="speedometer-outline" size={18} color={colors.info} />
          <Text style={styles.statValue}>{result.distance} m</Text>
          <Text style={styles.statLabel}>mesafe</Text>
        </View>
        <View style={styles.stat} testID="game-over-best">
          <Ionicons name="star" size={18} color={colors.brandPrimary} />
          <Text style={styles.statValue}>{bestScore.toLocaleString("tr-TR")}</Text>
          <Text style={styles.statLabel}>en iyi</Text>
        </View>
      </View>
      <SheetActions>
        <ChunkyButton testID="game-over-home-button" label="Ana Menü" icon="home" variant="neutral" onPress={onHome} style={styles.flex} />
        <ChunkyButton testID="game-over-retry-button" label="Tekrar" icon="refresh" variant="primary" onPress={onRetry} style={styles.flex} />
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
  flex: { flex: 1 },
}));
