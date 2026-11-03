import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ads } from "@/src/ads/ads";
import { ApiError } from "@/src/api";
import { audio, MUSIC_TRACKS } from "@/src/audio";
import { ChunkyButton } from "@/src/components/ChunkyButton";
import { effectiveQuality, QUALITY_ORDER, type QualityPref } from "@/src/game/quality/profiles";
import { useT } from "@/src/i18n";
import { APP_VERSION, useProfile } from "@/src/profile";
import Purchases, { configureRevenueCat, isPremium, loadMonthlyPackage, premiumExpiry } from "@/src/subscription";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const QUALITY_CHOICES: QualityPref[] = ["auto", ...[...QUALITY_ORDER].reverse()];

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfile();
  const t = useT();
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
  const changingTrackRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionMsg, setSubscriptionMsg] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [privacyOptions, setPrivacyOptions] = useState(ads.privacyOptionsRequired());

  useEffect(() => {
    let alive = true;
    loadMonthlyPackage().then((pkg) => alive && setPrice(pkg?.product.priceString ?? null));
    setPrivacyOptions(ads.privacyOptionsRequired());
    return () => {
      alive = false;
    };
  }, []);

  const errorText = (e: unknown) => (e instanceof ApiError && e.status === 0 ? t("account.needOnline") : e instanceof Error && e.message ? e.message : t("common.error"));

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
          setTrackMsg(t("settings.trackAdIncomplete"));
          return;
        }
      }
      setTrackMsg(null);
      await profile.setMusicTrack(id);
      await profile.registerSongChange();
    } catch {
      setTrackMsg(t("settings.trackFailed"));
    } finally {
      changingTrackRef.current = false;
      setAdBusy(false);
    }
  };

  const save = async () => {
    const v = nick.trim();
    if (v.length < 2) {
      setMsg(t("settings.nickTooShort"));
      return;
    }
    setSaving(true);
    try {
      await profile.setNickname(v);
      setMsg(t("settings.saved"));
    } catch (e) {
      // Moderation errors come back as a readable server message.
      setMsg(e instanceof ApiError && e.status === 422 ? e.message : t("settings.savedLocal"));
    } finally {
      setSaving(false);
    }
  };

  const onSubscriptionPress = async () => {
    if (subscriptionBusy) return;
    setSubscriptionBusy(true);
    setSubscriptionMsg(null);
    try {
      if (profile.adFree) {
        await Linking.openURL("https://play.google.com/store/account/subscriptions");
        return;
      }
      const pkg = await loadMonthlyPackage();
      if (!pkg) throw new Error(t("sub.unavailable"));
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (!isPremium(customerInfo)) throw new Error(t("sub.failed"));
      await profile.setAdFree(true, premiumExpiry(customerInfo));
      setSubscriptionMsg(t("sub.started"));
    } catch (error) {
      const e = error as { userCancelled?: boolean; message?: string };
      if (!e.userCancelled) {
        console.warn("[subscription] purchase failed", error);
        setSubscriptionMsg(e.message === t("sub.unavailable") ? t("sub.unavailable") : t("sub.failed"));
      }
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const restoreSubscription = async () => {
    if (subscriptionBusy) return;
    setSubscriptionBusy(true);
    setSubscriptionMsg(null);
    try {
      if (!configureRevenueCat()) throw new Error("unavailable");
      const info = await Purchases.restorePurchases();
      const active = isPremium(info);
      await profile.setAdFree(active, active ? premiumExpiry(info) : null);
      setSubscriptionMsg(active ? t("sub.restored") : t("sub.noneFound"));
    } catch (error) {
      const e = error as { userCancelled?: boolean };
      if (!e.userCancelled) setSubscriptionMsg(t("sub.unavailable"));
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const makeCode = async () => {
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      const out = await profile.createTransferCode();
      setCode(out.code);
    } catch (e) {
      setAccountMsg(errorText(e));
    } finally {
      setAccountBusy(false);
    }
  };

  const redeem = async () => {
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      await profile.redeemTransferCode(redeemCode);
      setRedeemCode("");
      setAccountMsg(t("account.transferDone"));
    } catch (e) {
      setAccountMsg(errorText(e));
    } finally {
      setAccountBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      await profile.deleteAccount();
      setConfirmDelete(false);
      setAccountMsg(t("account.deleted"));
    } catch {
      setAccountMsg(t("account.deleteFailed"));
    } finally {
      setAccountBusy(false);
    }
  };

  const accountLine =
    profile.account === "online"
      ? t("account.online")
      : profile.account === "legacy"
        ? t("account.legacyState")
        : profile.account === "none"
          ? t("account.noneState")
          : profile.account === "loading"
            ? t("common.loading")
            : profile.account === "conflict"
              ? t("account.conflictTitle")
              : t("account.offlineState");
  const online = profile.account === "online";
  const g = profile.graphics;
  const qualityName = (q: QualityPref) => (q === "auto" ? t("settings.qualityAuto") : t(`settings.quality.${q}`));
  const priceText = price ?? t("sub.priceLoading");

  return (
    <View style={styles.root} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <Pressable testID="settings-close-button" accessibilityRole="button" onPress={close} style={styles.close}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        {/* Nickname */}
        <Text style={styles.section}>{t("settings.nickname")}</Text>
        <View style={styles.card}>
          <TextInput
            testID="settings-nickname-input"
            value={nick}
            onChangeText={(v) => {
              setNick(v);
              setMsg(null);
            }}
            maxLength={16}
            placeholder={t("settings.nicknamePlaceholder")}
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <ChunkyButton testID="settings-save-button" label={t("common.save")} icon="checkmark" disabled={saving || nick.trim() === profile.nickname} onPress={save} />
          {msg ? (
            <Text testID="settings-message" style={styles.msg}>
              {msg}
            </Text>
          ) : null}
          <Text style={styles.help}>
            {t("settings.friendCode")} <Text style={styles.code}>{profile.friendCode ?? t("common.offline")}</Text>
          </Text>
        </View>

        {/* Account */}
        <Text style={styles.section}>{t("settings.account")}</Text>
        <View style={styles.card} testID="settings-account-card">
          <View style={styles.rowItem}>
            <Ionicons name={online ? "cloud-done" : "cloud-offline-outline"} size={22} color={online ? colors.success : colors.muted} />
            <Text style={[styles.rowTitle, styles.rowText]}>{accountLine}</Text>
            {profile.account === "offline" ? <ChunkyButton testID="settings-retry-connect" label={t("account.retry")} variant="neutral" onPress={() => void profile.retryConnect()} /> : null}
          </View>
          <View style={styles.divider} />
          <Text style={styles.rowTitle}>{t("account.transferTitle")}</Text>
          <Text style={styles.help}>{t("account.transferHelp")}</Text>
          {code ? (
            <View style={styles.codeCard} testID="settings-transfer-code">
              <Text style={styles.bigCode} selectable>
                {code}
              </Text>
              <Text style={styles.help}>{t("account.codeValid")}</Text>
            </View>
          ) : (
            <ChunkyButton testID="settings-make-code" label={t("account.makeCode")} icon="swap-horizontal" variant="secondary" disabled={!online || accountBusy} onPress={makeCode} />
          )}
          <View style={styles.inlineRow}>
            <TextInput
              testID="settings-redeem-input"
              value={redeemCode}
              onChangeText={(v) => setRedeemCode(v.toUpperCase())}
              placeholder={t("account.codePlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={14}
              style={[styles.input, styles.flex]}
            />
            <ChunkyButton
              testID="settings-redeem-button"
              label={t("account.enterCode")}
              variant="neutral"
              disabled={accountBusy || redeemCode.replace(/[^A-Z0-9]/g, "").length < 12}
              onPress={redeem}
            />
          </View>
          {accountMsg ? (
            <Text style={styles.msg} testID="settings-account-message">
              {accountMsg}
            </Text>
          ) : null}
        </View>

        {/* Subscription */}
        <Text style={styles.section}>{t("sub.section")}</Text>
        <View style={[styles.card, { borderColor: colors.brandTertiary }]} testID="settings-adfree-card">
          <View style={styles.rowItem}>
            <View style={[styles.ctrlIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="star" size={20} color={colors.onBrandTertiary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{profile.adFree ? t("sub.active") : t("sub.monthly", { price: priceText })}</Text>
              <Text style={styles.help}>{t("sub.perks")}</Text>
            </View>
          </View>
          <ChunkyButton
            testID="settings-adfree-button"
            label={subscriptionBusy ? t("sub.busy") : profile.adFree ? t("sub.manage") : t("sub.subscribe", { price: priceText })}
            icon="card"
            variant="gold"
            disabled={subscriptionBusy || (!profile.adFree && !price)}
            onPress={onSubscriptionPress}
          />
          <ChunkyButton testID="settings-restore-purchases-button" label={subscriptionBusy ? t("sub.busy") : t("sub.restore")} icon="refresh" disabled={subscriptionBusy} onPress={restoreSubscription} />
          <Text style={styles.help}>{t("sub.terms")}</Text>
          {subscriptionMsg ? (
            <Text testID="settings-subscription-message" style={styles.msg}>
              {subscriptionMsg}
            </Text>
          ) : null}
        </View>

        {/* Graphics */}
        <Text style={styles.section}>{t("settings.graphics")}</Text>
        <View style={styles.card} testID="settings-graphics-card">
          <Text style={styles.rowTitle}>{t("settings.quality")}</Text>
          <View style={styles.chips}>
            {QUALITY_CHOICES.map((q) => (
              <Chip key={q} testID={`settings-quality-${q}`} label={qualityName(q)} active={g.quality === q} onPress={() => profile.setGraphics({ quality: q })} />
            ))}
          </View>
          <Text style={styles.help}>
            {g.quality === "auto" ? t("settings.qualityAutoHelp", { profile: qualityName(effectiveQuality(g)) }) : t("settings.qualityHelp")}
          </Text>
          {g.quality === "ultra" ? <Text style={[styles.help, { color: colors.warning }]}>{t("settings.ultraWarning")}</Text> : null}
          <View style={styles.divider} />
          <Text style={styles.rowTitle}>{t("settings.fps")}</Text>
          <View style={styles.chips}>
            <Chip testID="settings-fps-30" label={t("settings.fps30")} active={g.fps === 30} onPress={() => profile.setGraphics({ fps: 30 })} />
            <Chip testID="settings-fps-60" label={t("settings.fps60")} active={g.fps === 60} onPress={() => profile.setGraphics({ fps: 60 })} />
          </View>
          <View style={styles.divider} />
          <SwitchRow testID="settings-shadows-switch" title={t("settings.shadows")} help={t("settings.shadowsHelp")} value={g.shadows} onChange={(v) => profile.setGraphics({ shadows: v })} />
          <Text style={styles.help}>{t("settings.graphicsNote")}</Text>
        </View>

        {/* Sound */}
        <Text style={styles.section}>{t("settings.sound")}</Text>
        <View style={styles.card}>
          <SwitchRow testID="settings-sound-switch" title={t("settings.sfx")} help={t("settings.sfxHelp")} value={profile.sound} onChange={(v) => profile.setSound(v)} />
          <View style={styles.divider} />
          <SwitchRow testID="settings-music-switch" title={t("settings.music")} help={t("settings.musicHelp")} value={profile.music} onChange={(v) => profile.setMusic(v)} />
          <View style={styles.divider} />
          <Text style={styles.rowTitle}>{t("settings.track")}</Text>
          <Text style={styles.help}>{profile.adFree ? t("settings.trackUnlimited") : t("settings.trackAd")}</Text>
          {MUSIC_TRACKS.map((tr) => {
            const active = tr.id === profile.musicTrack;
            return (
              <Pressable
                key={tr.id}
                testID={`settings-track-${tr.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                disabled={adBusy}
                onPress={() => changeTrack(tr.id)}
                style={[styles.track, { borderColor: active ? colors.info : colors.border, backgroundColor: active ? colors.surfaceTertiary : colors.surfaceSecondary }]}
              >
                <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={22} color={active ? colors.info : colors.muted} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{tr.title}</Text>
                  <Text style={styles.help}>{tr.artist}</Text>
                </View>
                {active && profile.music ? (
                  <Ionicons name="musical-notes" size={18} color={colors.info} />
                ) : !active && !profile.adFree && profile.songChanges > 0 ? (
                  <Ionicons name="play-circle-outline" size={18} color={colors.muted} />
                ) : null}
              </Pressable>
            );
          })}
          {trackMsg ? (
            <Text testID="settings-track-message" style={styles.msg}>
              {trackMsg}
            </Text>
          ) : null}
          <Pressable onPress={() => router.push("/licenses")} testID="settings-music-credits">
            <Text style={styles.help}>{t("settings.musicCredits", { credits: "NoCopyrightSounds (ncs.io)" })} ›</Text>
          </Pressable>
        </View>

        {/* Game */}
        <Text style={styles.section}>{t("settings.game")}</Text>
        <View style={styles.card}>
          <SwitchRow
            testID="settings-haptics-switch"
            title={t("settings.haptics")}
            help={t("settings.hapticsHelp")}
            value={profile.haptics}
            onChange={(v) => {
              profile.setHaptics(v);
              if (v) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            }}
          />
          <View style={styles.divider} />
          <NavRow testID="settings-haptics-test-button" icon="phone-portrait-outline" title={t("settings.hapticsTest")} help={t("settings.hapticsTestHelp")} onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)} />
          <View style={styles.divider} />
          <NavRow testID="settings-reset-tutorial-button" icon="refresh" title={t("settings.resetTutorial")} help={t("settings.resetTutorialHelp")} onPress={() => profile.resetTutorial()} />
          <View style={styles.divider} />
          <NavRow
            testID="settings-reset-data-button"
            icon="trash-outline"
            danger
            title={confirmReset ? t("settings.resetLocalConfirm") : t("settings.resetLocal")}
            help={t("settings.resetLocalHelp")}
            onPress={() => {
              if (confirmReset) {
                void profile.resetLocalData();
                setConfirmReset(false);
              } else setConfirmReset(true);
            }}
          />
        </View>

        {/* Language */}
        <Text style={styles.section}>{t("settings.language")}</Text>
        <View style={styles.card}>
          <View style={styles.chips}>
            <Chip testID="settings-lang-auto" label={t("settings.langAuto")} active={profile.langAuto} onPress={() => profile.setLanguage("auto")} />
            <Chip testID="settings-lang-tr" label={t("settings.langTr")} active={!profile.langAuto && profile.lang === "tr"} onPress={() => profile.setLanguage("tr")} />
            <Chip testID="settings-lang-en" label={t("settings.langEn")} active={!profile.langAuto && profile.lang === "en"} onPress={() => profile.setLanguage("en")} />
          </View>
        </View>

        {/* Privacy */}
        <Text style={styles.section}>{t("settings.privacy")}</Text>
        <View style={styles.card} testID="settings-privacy-card">
          <NavRow testID="settings-privacy-policy" icon="shield-checkmark-outline" title={t("settings.privacyPolicy")} help={t("settings.privacyHelp")} onPress={() => router.push("/privacy")} chevron />
          <View style={styles.divider} />
          <NavRow testID="settings-terms" icon="document-text-outline" title={t("settings.terms")} help={t("settings.termsHelp")} onPress={() => router.push("/terms")} chevron />
          <View style={styles.divider} />
          <NavRow testID="settings-licenses" icon="ribbon-outline" title={t("settings.licenses")} help={t("settings.licensesHelp")} onPress={() => router.push("/licenses")} chevron />
          {privacyOptions ? (
            <>
              <View style={styles.divider} />
              <NavRow
                testID="settings-ad-privacy"
                icon="options-outline"
                title={t("settings.adPrivacy")}
                help={t("settings.adPrivacyHelp")}
                onPress={async () => {
                  await ads.showPrivacyOptions();
                  setPrivacyOptions(ads.privacyOptionsRequired());
                }}
                chevron
              />
            </>
          ) : null}
          <View style={styles.divider} />
          <SwitchRow testID="settings-online-visible" title={t("settings.onlineVisible")} help={t("settings.onlineVisibleHelp")} value={profile.onlineVisible} onChange={(v) => profile.setOnlineVisible(v)} />
          <View style={styles.divider} />
          <NavRow
            testID="settings-delete-account"
            icon="person-remove-outline"
            danger
            title={confirmDelete ? t("account.deleteConfirm") : t("account.deleteTitle")}
            help={confirmDelete ? t("account.deleteBody") : t("settings.deleteHelp")}
            onPress={deleteAccount}
            disabled={accountBusy || !online}
          />
          {confirmDelete ? <ChunkyButton testID="settings-delete-cancel" label={t("common.cancel")} variant="neutral" onPress={() => setConfirmDelete(false)} /> : null}
          {!online ? (
            <Pressable onPress={() => router.push("/delete-account")}>
              <Text style={styles.help}>{t("account.needOnline")} ›</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Controls */}
        <Text style={styles.section}>{t("settings.controls")}</Text>
        <View style={styles.card}>
          {(
            [
              ["arrow-back", "settings.ctrlLeft", "settings.ctrlLeftHelp"],
              ["arrow-forward", "settings.ctrlRight", "settings.ctrlRightHelp"],
              ["arrow-up", "settings.ctrlUp", "settings.ctrlUpHelp"],
              ["arrow-down", "settings.ctrlDown", "settings.ctrlDownHelp"],
            ] as const
          ).map(([icon, title, help]) => (
            <View key={title} style={styles.ctrl}>
              <View style={styles.ctrlIcon}>
                <Ionicons name={icon} size={20} color={colors.onBrandPrimary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t(title)}</Text>
                <Text style={styles.help}>{t(help)}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.help}>{t("settings.ctrlNote")}</Text>
        </View>

        <Text style={[styles.help, styles.version]} testID="settings-version">
          {t("app.name")} · {t("settings.version", { version: APP_VERSION })}
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.info : colors.surfaceTertiary, borderColor: active ? colors.infoShade : colors.border }]}
    >
      <Text style={[styles.chipText, { color: active ? colors.onInfo : colors.onSurfaceTertiary }]}>{label}</Text>
    </Pressable>
  );
}

function SwitchRow({ title, help, value, onChange, testID }: { title: string; help: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.rowItem}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.help}>{help}</Text>
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: colors.info, false: colors.border }} thumbColor={colors.surfaceSecondary} />
    </View>
  );
}

function NavRow(props: { icon: IconName; title: string; help: string; onPress: () => void; testID: string; danger?: boolean; chevron?: boolean; disabled?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = props.danger ? colors.error : colors.info;
  return (
    <Pressable testID={props.testID} accessibilityRole="button" onPress={props.onPress} disabled={props.disabled} style={[styles.rowItem, props.disabled && styles.disabled]}>
      <Ionicons name={props.icon} size={22} color={color} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, props.danger && { color: colors.error }]}>{props.title}</Text>
        <Text style={styles.help}>{props.help}</Text>
      </View>
      {props.chevron ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.sm },
  section: { fontFamily: fonts.textHeavy, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: colors.muted, marginTop: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
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
  inlineRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  flex: { flex: 1 },
  msg: { fontFamily: fonts.textBold, fontSize: 13, color: colors.info },
  help: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  code: { fontFamily: fonts.display, color: colors.info, letterSpacing: 1.5 },
  codeCard: { alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md },
  bigCode: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 2, color: colors.info },
  rowItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary },
  divider: { height: 1, backgroundColor: colors.divider },
  track: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 2 },
  ctrl: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ctrlIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: fonts.textHeavy, fontSize: 13 },
  disabled: { opacity: 0.5 },
  version: { textAlign: "center", marginTop: spacing.lg },
}));
