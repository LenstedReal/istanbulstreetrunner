import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { fmt, t as tr, useT } from "@/src/i18n";
import type { StringKey } from "@/src/i18n/tr";
import { useProfile } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

const rewardText = (keys: number, coins: number) =>
  [keys > 0 ? tr("reward.keys", { n: keys }) : null, coins > 0 ? tr("reward.coins", { n: coins }) : null].filter(Boolean).join(" + ");

/** Three daily missions from the server; rewards are added to keys and coins. */
export default function MissionsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { account, refreshMissions } = profile;

  useEffect(() => {
    if (account === "online") void refreshMissions();
  }, [account, refreshMissions]);

  const claim = async (id: string) => {
    setBusy(id);
    setMsg(null);
    try {
      const out = await profile.claimMission(id);
      setMsg(t("missions.got", { reward: rewardText(out.keys, out.coins) }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const list = profile.missions?.missions ?? [];

  return (
    <View style={styles.root} testID="missions-screen">
      <ScreenHeader title={t("missions.title")} testID="missions" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {profile.account === "loading" ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.help}>{t("common.loading")}</Text>
          </View>
        ) : profile.account === "legacy" ? (
          <View style={styles.center} testID="missions-server-old">
            <Ionicons name="construct-outline" size={40} color={colors.muted} />
            <Text style={[styles.help, styles.centerText]}>{t("missions.serverOld")}</Text>
          </View>
        ) : profile.account === "offline" ? (
          <View style={styles.center} testID="missions-offline">
            <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
            <Text style={[styles.help, styles.centerText]}>{t("missions.offline")}</Text>
            <ChunkyButton testID="missions-retry" label={t("account.retry")} variant="neutral" onPress={() => void profile.retryConnect()} />
          </View>
        ) : profile.account !== "online" ? (
          <View style={styles.center}>
            <Ionicons name="person-circle-outline" size={40} color={colors.muted} />
            <Text style={[styles.help, styles.centerText]}>{t("missions.accountIssue")}</Text>
          </View>
        ) : profile.missions === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.help}>{profile.waking ? t("board.waking") : t("common.loading")}</Text>
          </View>
        ) : list.length === 0 ? (
          <Text style={styles.help}>{t("missions.empty")}</Text>
        ) : (
          list.map((m) => {
            const done = m.progress >= m.target;
            const pct = Math.min(1, m.progress / Math.max(1, m.target));
            return (
              <View key={m.id} style={[styles.card, done && !m.claimed && { borderColor: colors.success }]} testID={`mission-${m.id}`}>
                <Text style={styles.title}>{t(`mission.${m.kind}` as StringKey, { n: fmt(m.target) })}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: done ? colors.success : colors.info }]} />
                </View>
                <View style={styles.row}>
                  <Text style={styles.help}>
                    {fmt(Math.min(m.progress, m.target))} / {fmt(m.target)} · {t("missions.reward", { reward: rewardText(m.reward_keys, m.reward_coins) })}
                  </Text>
                  {m.claimed ? (
                    <Text style={[styles.help, { color: colors.success }]}>{t("missions.claimed")}</Text>
                  ) : (
                    <ChunkyButton testID={`mission-claim-${m.id}`} label={t("missions.claim")} variant="gold" disabled={!done || busy !== null} onPress={() => claim(m.id)} />
                  )}
                </View>
              </View>
            );
          })
        )}
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { alignItems: "center", gap: spacing.md, padding: spacing.xxl },
  card: { gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 2.5, borderColor: colors.border, borderBottomWidth: 5, borderRadius: radius.lg, padding: spacing.md },
  title: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary },
  track: { height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  help: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, flexShrink: 1 },
  centerText: { textAlign: "center" },
  msg: { fontFamily: fonts.textBold, fontSize: 14, color: colors.info, textAlign: "center" },
}));
