import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ads } from "@/src/ads/ads";
import { audio, MUSIC_TRACKS } from "@/src/audio";
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
  useEffect(() => {
    setNick(profile.nickname);
  }, [profile.nickname]);
  // Track preview: play the chosen song while this screen is open, stop when leaving.
  useEffect(() => {
    if (profile.music) audio.startMusic();
    return () => audio.pauseMusic();
  }, [profile.music, profile.musicTrack]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const [adBusy, setAdBusy] = useState(false);
  const [trackMsg, setTrackMsg] = useState<string | null>(null);
  const changingTrackRef = React.useRef(false);

  /** First change is free; later changes need a rewarded ad unless the player is ad-free. */
  const changeTrack = async (id: string) => {
    if (changingTrackRef.current || id === profile.musicTrack) return;
    changingTrackRef.current = true;
    setAdBusy(true);
    try {
      const needsAd = !profile.adFree && profile.songChanges >= 1;
      if (needsAd && ads.available) {
        const earned = await ads.showRewarded();
        if (!earned) {
          setTrackMsg("Reklam tamamlanmadı, parça değişmedi");
          return;
        }
      }
      setTrackMsg(null);
      await profile.setMusicTrack(id);
      await profile.registerSongChange();
    } catch {
      setTrackMsg("Parça değiştirilemedi. Tekrar dene.");
    } finally {
      changingTrackRef.current = false;
      setAdBusy(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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
        <Pressable testID="settings-close-button" accessibilityRole="button" onPress={close} style={styles.close}>
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

        <Text style={styles.section}>Reklamsız Deneyim</Text>
        <View style={[styles.card, { borderColor: colors.brandTertiary }]} testID="settings-adfree-card">
          <View style={styles.rowItem}>
            <View style={[styles.ctrlIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="star" size={20} color={colors.onBrandTertiary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{profile.adFree ? "Üyelik aktif" : "Aylık üyelik · 199 ₺"}</Text>
              <Text style={styles.help}>Reklam yok · Sınırsız müzik değişimi · 50 anahtar (hoş geldin paketi)</Text>
            </View>
          </View>
          <ChunkyButton
            testID="settings-adfree-button"
            label={profile.adFree ? "Üyeliği yönet" : "Abone ol · 199 ₺ / ay"}
            icon="card"
            variant="gold"
            onPress={() => undefined}
          />
        </View>

        <Text style={styles.section}>Ses</Text>
        <View style={styles.card}>
          <View style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Ses efektleri</Text>
              <Text style={styles.help}>Zıplama, altın toplama ve çarpışma sesleri</Text>
            </View>
            <Switch testID="settings-sound-switch" value={profile.sound} onValueChange={(v) => profile.setSound(v)} trackColor={{ true: colors.info, false: colors.border }} thumbColor={colors.surfaceSecondary} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Müzik</Text>
              <Text style={styles.help}>Koşu sırasında arka plan müziği</Text>
            </View>
            <Switch testID="settings-music-switch" value={profile.music} onValueChange={(v) => profile.setMusic(v)} trackColor={{ true: colors.info, false: colors.border }} thumbColor={colors.surfaceSecondary} />
          </View>
          <View style={styles.divider} />
          <Text style={styles.rowTitle}>Parça seç</Text>
          <Text style={styles.help}>
            {profile.adFree ? "Sınırsız parça değişimi" : profile.songChanges === 0 ? "İlk değişim ücretsiz, sonrası reklamla" : "Parça değiştirmek için reklam izle"}
          </Text>
          {MUSIC_TRACKS.map((t) => {
            const active = t.id === profile.musicTrack;
            return (
              <Pressable
                key={t.id}
                testID={`settings-track-${t.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                disabled={adBusy}
                onPress={() => changeTrack(t.id)}
                style={[styles.track, { borderColor: active ? colors.info : colors.border, backgroundColor: active ? colors.surfaceTertiary : colors.surfaceSecondary }]}
              >
                <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={22} color={active ? colors.info : colors.muted} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{t.title}</Text>
                  <Text style={styles.help}>{t.artist}</Text>
                </View>
                {active && profile.music ? <Ionicons name="musical-notes" size={18} color={colors.info} /> : !active && !profile.adFree && profile.songChanges > 0 ? <Ionicons name="play-circle-outline" size={18} color={colors.muted} /> : null}
              </Pressable>
            );
          })}
          {trackMsg ? (
            <Text testID="settings-track-message" style={styles.msg}>
              {trackMsg}
            </Text>
          ) : null}
          <Text style={styles.help} testID="settings-music-credits">
            Müzikler NoCopyrightSounds (ncs.io) yayınlarıdır.
          </Text>
        </View>

        <Text style={styles.section}>Oyun</Text>
        <View style={styles.card}>
          <View style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Gölgeler</Text>
              <Text style={styles.help}>Daha gerçekçi görüntü · Takılma olursa kapat</Text>
            </View>
            <Switch testID="settings-shadows-switch" value={profile.shadows} onValueChange={(v) => profile.setShadows(v)} trackColor={{ true: colors.info, false: colors.border }} thumbColor={colors.surfaceSecondary} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Titreşim</Text>
              <Text style={styles.help}>Şerit değişimi, altın ve çarpışmada</Text>
            </View>
            <Switch
              testID="settings-haptics-switch"
              value={profile.haptics}
              onValueChange={(v) => {
                profile.setHaptics(v);
                if (v) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
              }}
              trackColor={{ true: colors.info, false: colors.border }}
              thumbColor={colors.surfaceSecondary}
            />
          </View>
          <View style={styles.divider} />
          <Pressable
            testID="settings-haptics-test-button"
            accessibilityRole="button"
            onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)}
            style={styles.rowItem}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Titreşimi dene</Text>
              <Text style={styles.help}>Hissetmiyorsan telefonun titreşim ayarını kontrol et</Text>
            </View>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.info} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable testID="settings-reset-tutorial-button" accessibilityRole="button" onPress={() => profile.resetTutorial()} style={styles.rowItem}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Öğreticiyi tekrar göster</Text>
              <Text style={styles.help}>İpuçları bir sonraki koşuda çıkar</Text>
            </View>
            <Ionicons name="refresh" size={22} color={colors.info} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            testID="settings-reset-data-button"
            accessibilityRole="button"
            onPress={() => {
              if (confirmReset) {
                void profile.resetLocalData();
                setConfirmReset(false);
                setMsg(null);
              } else setConfirmReset(true);
            }}
            style={styles.rowItem}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.error }]}>{confirmReset ? "Emin misin? Tekrar dokun" : "Yerel skorları sıfırla"}</Text>
              <Text style={styles.help}>En iyi skor, koşu geçmişi ve altınlar silinir</Text>
            </View>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>

        <Text style={styles.section}>Kontroller</Text>
        <View style={styles.card}>
          {[
            ["arrow-back", "Sola kaydır", "Sol şeride geç"],
            ["arrow-forward", "Sağa kaydır", "Sağ şeride geç"],
            ["arrow-up", "Yukarı kaydır", "Bariyer ve arabaların üstünden zıpla"],
            ["arrow-down", "Aşağı kaydır", "Tabelaların altından eğil"],
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
          <Text style={styles.help}>Tramvay ve sütunlar şeridi tamamen kapatır, şerit değiştir.</Text>
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
  track: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 2 },
  ctrl: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ctrlIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
