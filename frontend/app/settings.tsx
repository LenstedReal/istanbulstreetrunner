import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChunkyButton } from "@/src/components/ChunkyButton";
import { useProfile } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfile();
  const [nick, setNick] = useState(profile.nickname);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const v = nick.trim();
    if (v.length < 2) {
      setMsg("Takma ad en az 2 karakter olmalı");
      return;
    }
    setSaving(true);
    try {
      await profile.setNickname(v);
      setMsg("Kaydedildi");
    } catch {
      setMsg("Yerelde kaydedildi, sunucuya ulaşılamadı");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Ayarlar</Text>
        <Pressable testID="settings-close-button" accessibilityRole="button" onPress={() => router.back()} style={styles.close}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Takma ad</Text>
        <View style={styles.card}>
          <TextInput
            testID="settings-nickname-input"
            value={nick}
            onChangeText={(v) => {
              setNick(v);
              setMsg(null);
            }}
            maxLength={16}
            placeholder="Takma adın"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <ChunkyButton testID="settings-save-button" label="Kaydet" icon="checkmark" disabled={saving || nick.trim() === profile.nickname} onPress={save} />
          {msg ? (
            <Text testID="settings-message" style={styles.msg}>
              {msg}
            </Text>
          ) : null}
          <Text style={styles.help}>
            Arkadaş kodun: <Text style={styles.code}>{profile.friendCode ?? "çevrimdışı"}</Text>
          </Text>
        </View>

        <Text style={styles.section}>Oyun</Text>
        <View style={styles.card}>
          <View style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Titreşim</Text>
              <Text style={styles.help}>Şerit değişimi, altın ve çarpmalarda</Text>
            </View>
            <Switch
              testID="settings-haptics-switch"
              value={profile.haptics}
              onValueChange={(v) => profile.setHaptics(v)}
              trackColor={{ true: colors.info, false: colors.border }}
              thumbColor={colors.surfaceSecondary}
            />
          </View>
          <View style={styles.divider} />
          <Pressable testID="settings-reset-tutorial-button" accessibilityRole="button" onPress={() => profile.resetTutorial()} style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Öğreticiyi tekrar göster</Text>
              <Text style={styles.help}>{profile.tutorialSeen ? "Bir sonraki koşuda ipuçları görünür" : "Ipuçları bir sonraki koşuda gösterilecek"}</Text>
            </View>
            <Ionicons name="refresh" size={22} color={colors.info} />
          </Pressable>
        </View>

        <Text style={styles.section}>Kontroller</Text>
        <View style={styles.card}>
          {[
            ["arrow-back", "Sola kaydır", "Sol şeride geç"],
            ["arrow-forward", "Sağa kaydır", "Sağ şeride geç"],
            ["arrow-up", "Yukarı kaydır", "Simit arabası ve bariyerlerin üstünden zıpla"],
            ["arrow-down", "Aşağı kaydır", "Tabelaların altından eğilerek geç"],
          ].map(([icon, t, d]) => (
            <View key={t} style={styles.ctrl}>
              <View style={styles.ctrlIcon}>
                <Ionicons name={icon as React.ComponentProps<typeof Ionicons>["name"]} size={20} color={colors.onBrandPrimary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t}</Text>
                <Text style={styles.help}>{d}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.help}>Tramvaylar ve taş sütunlar şeridi tamamen kapatır — kaç!</Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.sm },
  section: { fontFamily: fonts.textHeavy, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: colors.muted, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.textBold,
    fontSize: 16,
    color: colors.onSurfaceTertiary,
  },
  msg: { fontFamily: fonts.textBold, fontSize: 13, color: colors.info },
  help: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  code: { fontFamily: fonts.display, color: colors.info, letterSpacing: 1.5 },
  rowItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary },
  divider: { height: 1, backgroundColor: colors.divider },
  ctrl: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ctrlIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
