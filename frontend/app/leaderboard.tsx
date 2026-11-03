import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, type PlayerOut, type PublicPlayer } from "@/src/api";
import { ChunkyButton } from "@/src/components/ChunkyButton";
import { fmt, shortDate, useT } from "@/src/i18n";
import { useProfile } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type Tab = "local" | "friends" | "global";

interface Row {
  key: string;
  rank: number;
  name: string;
  score: number;
  /** Free text (local runs) or runs/coins for server rows. */
  sub?: string;
  runs?: number;
  coins?: number;
  /** Own row appended below the top list. */
  ownExtra?: boolean;
  isMe?: boolean;
  online?: boolean;
  /** Public id (v2) or player id (1.0.x server) used for actions. */
  ref?: string;
  friend?: boolean;
}

export default function LeaderboardScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfile();
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("local");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const v2 = profile.account === "online";
  const legacy = profile.account === "legacy";
  const playerId = profile.playerId;

  const friendsQ = useQuery({
    queryKey: ["friends", v2 ? "v2" : playerId],
    queryFn: async (): Promise<Row[]> => {
      if (v2) return (await api.friendsV2()).board.map((p) => fromPublic(p, true));
      return (await api.getFriends(playerId as string)).board.map((p) => fromLegacy(p, !p.is_me));
    },
    enabled: tab === "friends" && (v2 || (legacy && !!playerId)),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const globalQ = useQuery({
    queryKey: ["leaderboard", v2 ? "v2" : playerId],
    queryFn: async (): Promise<Row[]> => {
      if (v2) {
        const out = await api.leaderboardV2(50);
        const rows = out.top.map((p) => fromPublic(p, false));
        if (out.me && !out.top.some((p) => p.is_me)) rows.push({ ...fromPublic(out.me, false), key: "me", ownExtra: true });
        return rows;
      }
      return (await api.leaderboard(playerId)).map((p) => fromLegacy(p, false));
    },
    enabled: tab === "global" && (v2 || legacy),
  });

  // Legacy server only: the stored id no longer exists -> recreate the online profile.
  useEffect(() => {
    if (legacy && friendsQ.error instanceof ApiError && friendsQ.error.status === 404) void profile.recoverOnline();
  }, [legacy, friendsQ.error, profile]);

  useEffect(() => {
    if (profile.loaded && (profile.account === "offline" || profile.account === "loading")) void profile.ensureOnline();
  }, [profile.loaded, profile.account, profile]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["friends"] });
    void qc.invalidateQueries({ queryKey: ["leaderboard"] });
  };

  const addFriend = useMutation({
    mutationFn: async (c: string) => {
      if (v2) return (await api.addFriendV2(c)).nickname;
      const id = playerId ?? (await profile.ensureOnline());
      if (!id) throw new ApiError(0, t("net.offline"));
      return (await api.addFriend(id, c)).nickname;
    },
    onSuccess: (name) => {
      setCode("");
      setMessage({ text: t("board.added", { name }), error: false });
      refresh();
    },
    onError: (e) => setMessage({ text: e instanceof Error ? e.message : t("board.error"), error: true }),
  });

  const act = useMutation({
    mutationFn: async ({ kind, ref }: { kind: "remove" | "block" | "report"; ref: string }) => {
      if (kind === "remove") {
        if (v2) await api.removeFriendV2(ref);
        else await api.removeFriend(playerId as string, ref);
        return t("board.remove");
      }
      if (kind === "block") {
        await api.block(ref);
        return t("board.blocked");
      }
      await api.report(ref, "nickname");
      return t("board.reported");
    },
    onSuccess: (text) => {
      setOpenRow(null);
      setMessage({ text, error: false });
      refresh();
    },
    onError: (e) => setMessage({ text: e instanceof Error ? e.message : t("board.error"), error: true }),
  });

  const rows: Row[] =
    tab === "local"
      ? profile.localScores.map((s, i) => ({
          key: `${s.date}-${i}`,
          rank: i + 1,
          name: profile.nickname,
          score: s.score,
          sub: t("board.localSub", { distance: fmt(s.distance), coins: fmt(s.coins), date: shortDate(s.date) }),
          isMe: i === 0,
        }))
      : tab === "friends"
        ? (friendsQ.data ?? [])
        : (globalQ.data ?? []);

  const query = tab === "friends" ? friendsQ : globalQ;
  const loading = tab !== "local" && query.isLoading;
  const error = tab !== "local" && (query.isError || (!v2 && !legacy));
  const tabs: { key: Tab; label: string }[] = [
    { key: "local", label: t("board.local") },
    { key: "friends", label: t("board.friends") },
    { key: "global", label: t("board.world") },
  ];

  return (
    <View style={styles.root} testID="leaderboard-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable testID="leaderboard-back-button" accessibilityRole="button" onPress={goBack} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>{t("board.title")}</Text>
          <View style={styles.back} />
        </View>

        <View style={styles.me} testID="leaderboard-profile-card">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.nickname.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.meInfo}>
            <Text style={styles.meName} numberOfLines={1}>
              {profile.nickname}
            </Text>
            <Text style={styles.meSub}>
              {t("board.best")} <Text style={styles.meBold}>{fmt(profile.bestScore)}</Text>
            </Text>
          </View>
          <Pressable testID="leaderboard-friend-code" onPress={() => router.push("/settings")} style={styles.codeBox}>
            <Text style={styles.codeLabel}>{t("board.friendCode")}</Text>
            <Text style={styles.code}>{profile.friendCode ?? "—"}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
          {tabs.map((tb) => {
            const active = tb.key === tab;
            return (
              <Pressable
                key={tb.key}
                testID={`leaderboard-tab-${tb.key}`}
                accessibilityRole="tab"
                onPress={() => {
                  setTab(tb.key);
                  setOpenRow(null);
                }}
                style={[styles.chip, { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimaryShade : colors.border }]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{tb.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex} keyboardVerticalOffset={16}>
        {tab === "friends" ? (
          <View style={styles.addRow}>
            <TextInput
              testID="friend-code-input"
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder={t("board.codePlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => code.length >= 4 && addFriend.mutate(code)}
            />
            <ChunkyButton testID="friend-add-button" label={t("board.add")} icon="person-add" variant="secondary" disabled={code.length < 4 || addFriend.isPending} onPress={() => addFriend.mutate(code)} />
          </View>
        ) : null}
        {message && tab !== "local" ? (
          <Text testID="friend-message" style={[styles.message, { color: message.error ? colors.error : colors.success }]}>
            {message.text}
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.center} testID="leaderboard-loading">
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.emptyText}>{profile.waking ? t("board.waking") : t("board.loading")}</Text>
          </View>
        ) : error ? (
          <View style={styles.center} testID="leaderboard-error">
            <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>{t("board.error")}</Text>
            <ChunkyButton
              testID="leaderboard-retry-button"
              label={t("common.retry")}
              variant="neutral"
              onPress={() => {
                if (!v2 && !legacy) void profile.retryConnect();
                else void query.refetch();
              }}
            />
          </View>
        ) : (
          <FlatList
            testID={`leaderboard-list-${tab}`}
            data={rows}
            keyExtractor={(r) => r.key}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.center} testID="leaderboard-empty">
                <Ionicons name={tab === "local" ? "flag-outline" : "people-outline"} size={40} color={colors.muted} />
                <Text style={styles.emptyText}>{tab === "local" ? t("board.emptyLocal") : tab === "friends" ? t("board.emptyFriends") : t("board.emptyWorld")}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <RankRow
                row={item}
                open={openRow === item.key}
                onToggle={item.ref && !item.isMe ? () => setOpenRow(openRow === item.key ? null : item.key) : undefined}
                busy={act.isPending}
                v2={v2}
                onAction={(kind) => item.ref && act.mutate({ kind, ref: item.ref })}
              />
            )}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function fromPublic(p: PublicPlayer, friend: boolean): Row {
  return {
    key: p.public_id,
    rank: p.rank ?? 0,
    name: p.nickname,
    score: p.high_score,
    runs: p.runs,
    coins: p.total_coins,
    isMe: p.is_me,
    online: p.online === true,
    ref: p.public_id,
    friend: friend && !p.is_me,
  };
}

function fromLegacy(p: PlayerOut, friend: boolean): Row {
  return { key: p.id, rank: p.rank ?? 0, name: p.nickname, score: p.high_score, runs: p.runs, coins: p.total_coins, isMe: p.is_me, ref: friend ? p.id : undefined, friend };
}

function RankRow({ row, open, onToggle, onAction, busy, v2 }: { row: Row; open: boolean; onToggle?: () => void; onAction: (k: "remove" | "block" | "report") => void; busy: boolean; v2: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const medal = row.rank === 1 ? colors.gold : row.rank === 2 ? colors.silver : row.rank === 3 ? colors.bronze : colors.surfaceTertiary;
  const sub = row.ownExtra ? t("board.yourRank") : row.sub ?? (row.runs !== undefined ? t("board.runs", { runs: fmt(row.runs), coins: fmt(row.coins ?? 0) }) : undefined);
  return (
    <View style={[styles.rowWrap, row.isMe && { borderColor: colors.info }]}>
      <Pressable style={styles.row} testID={`rank-row-${row.rank}`} onPress={onToggle} disabled={!onToggle}>
        <View style={[styles.rank, { backgroundColor: medal }]}>
          <Text style={styles.rankText}>{row.rank || "–"}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.name}
            {row.isMe ? `  ${t("board.you")}` : ""}
          </Text>
          <View style={styles.subRow}>
            {row.online ? (
              <View style={styles.onlineBadge}>
                <View style={styles.dot} />
                <Text style={styles.onlineText}>{t("board.online")}</Text>
              </View>
            ) : null}
            {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
          </View>
        </View>
        <Text style={styles.rowScore}>{fmt(row.score)}</Text>
        {onToggle ? <Ionicons name={open ? "chevron-up" : "ellipsis-vertical"} size={18} color={colors.muted} /> : null}
      </Pressable>
      {open ? (
        <View style={styles.actions}>
          {row.friend ? <ChunkyButton testID={`rank-row-remove-${row.rank}`} label={t("board.remove")} icon="person-remove" variant="neutral" disabled={busy} onPress={() => onAction("remove")} /> : null}
          {v2 ? <ChunkyButton testID={`rank-row-block-${row.rank}`} label={t("board.block")} icon="hand-left" variant="neutral" disabled={busy} onPress={() => onAction("block")} /> : null}
          {v2 ? <ChunkyButton testID={`rank-row-report-${row.rank}`} label={t("board.report")} icon="flag" variant="neutral" disabled={busy} onPress={() => onAction("report")} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface },
  me: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 2.5, borderColor: colors.borderStrong, borderBottomWidth: 5, borderRadius: radius.lg, padding: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display, fontSize: 20, color: colors.onBrandPrimary },
  meInfo: { flex: 1 },
  meName: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurfaceSecondary },
  meSub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  meBold: { fontFamily: fonts.textHeavy, color: colors.onSurfaceSecondary },
  codeBox: { alignItems: "flex-end", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  codeLabel: { fontFamily: fonts.textHeavy, fontSize: 9, letterSpacing: 1, color: colors.muted },
  code: { fontFamily: fonts.display, fontSize: 18, color: colors.info, letterSpacing: 2 },
  chipRow: { height: 56, flexGrow: 0 },
  chips: { gap: spacing.sm, alignItems: "center", paddingRight: spacing.lg },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipText: { fontFamily: fonts.textHeavy, fontSize: 14 },
  addRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  input: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, fontFamily: fonts.textBold, fontSize: 16, letterSpacing: 1.5, color: colors.onSurfaceSecondary },
  message: { fontFamily: fonts.textBold, fontSize: 13, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  emptyText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.muted, textAlign: "center" },
  rowWrap: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  rank: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary },
  subRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  onlineText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.success },
  rowScore: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurfaceSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
}));
