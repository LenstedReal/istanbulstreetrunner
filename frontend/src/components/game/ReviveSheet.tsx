import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { Sheet, SheetActions } from "@/src/components/game/Sheet";
import { fmt, useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

const COUNTDOWN = 8;

interface Props {
  score: number;
  cost: number;
  keys: number;
  revivesLeft: number;
  adsAvailable: boolean;
  busy: boolean;
  onUseKeys: () => void;
  onWatchAd: () => void;
  onGiveUp: () => void;
}

/** Subway Surfers style revive prompt: pay keys, watch an ad for keys, or end the run. */
export function ReviveSheet({ score, cost, keys, revivesLeft, adsAvailable, busy, onUseKeys, onWatchAd, onGiveUp }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const [left, setLeft] = useState(COUNTDOWN);

  useEffect(() => {
    if (busy) return;
    if (left <= 0) {
      onGiveUp();
      return;
    }
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left, busy, onGiveUp]);

  const canPay = keys >= cost;
  return (
    <Sheet title={t("revive.title")} testID="revive-sheet">
      <View style={styles.ring} testID="revive-countdown">
        <Text style={styles.ringText}>{left}</Text>
      </View>
      <Text style={styles.score}>{t("revive.score", { score: fmt(score) })}</Text>
      <View style={styles.costRow} testID="revive-cost">
        <Ionicons name="key" size={20} color={colors.brandTertiaryShade} />
        <Text style={styles.costText}>{t("revive.cost", { cost, keys })}</Text>
      </View>
      <ChunkyButton
        testID="revive-keys-button"
        label={canPay ? t("revive.useKeys", { cost }) : t("revive.notEnough", { cost })}
        icon="key"
        variant="gold"
        size="lg"
        disabled={!canPay || busy}
        onPress={onUseKeys}
      />
      <ChunkyButton
        testID="revive-ad-button"
        label={busy ? t("menu.adLoading") : t("revive.watchAdKeys", { cost })}
        icon="play-circle"
        variant="secondary"
        size="lg"
        disabled={busy || !adsAvailable}
        onPress={onWatchAd}
      />
      <SheetActions>
        <ChunkyButton testID="revive-giveup-button" label={t("revive.giveUp")} icon="flag" variant="neutral" onPress={onGiveUp} style={styles.flex} />
      </SheetActions>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  ring: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  ringText: { fontFamily: fonts.display, fontSize: 32, color: colors.brandPrimary },
  score: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface, textAlign: "center" },
  costRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  costText: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurface },
  hint: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: -spacing.sm },
  flex: { flex: 1 },
}));
