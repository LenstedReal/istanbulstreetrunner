import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { useT } from "@/src/i18n";
import { useProfile } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

/**
 * Shown right after the account was deleted on the server. The old identity is gone
 * from this phone too; the only way on is to start as a brand-new player, which also
 * happens when the player presses the back button.
 */
export default function AccountDeletedScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfile();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const startFresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await profile.startFresh();
    } finally {
      router.replace("/");
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      void startFresh();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- back always means "start fresh"
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]} testID="account-deleted-screen">
      <View style={styles.badge}>
        <Ionicons name="checkmark-done" size={44} color={colors.onBrandPrimary} />
      </View>
      <Text style={styles.title}>{t("account.deletedTitle")}</Text>
      <Text style={styles.body}>{t("account.deletedBody")}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t("account.newPlayer")}</Text>
        <Text style={styles.nick} testID="account-deleted-nickname">
          {profile.nickname}
        </Text>
      </View>
      <Text style={styles.help}>{t("account.deletedSub")}</Text>
      <ChunkyButton testID="account-deleted-start" label={busy ? t("common.loading") : t("account.startFresh")} icon="play" variant="primary" disabled={busy} onPress={() => void startFresh()} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 40, color: colors.onSurface, textAlign: "center" },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: colors.onSurface, textAlign: "center" },
  card: { alignSelf: "stretch", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary, borderWidth: 2.5, borderColor: colors.border, borderBottomWidth: 5, borderRadius: radius.lg, padding: spacing.md },
  label: { fontFamily: fonts.textHeavy, fontSize: 12, letterSpacing: 2, color: colors.muted },
  nick: { fontFamily: fonts.display, fontSize: 24, color: colors.brandPrimary },
  help: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: "center" },
}));
