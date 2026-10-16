import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, PlayerOut } from "@/src/api";
import { ChunkyButton } from "@/src/components/ChunkyButton";
import { useProfile } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

type Tab = "local" | "friends" | "global";
const TABS: { key: Tab; label: string }[] = [
  { key: "local", label: "Yerel" },
  { key: "friends", label: "Arkadaşlar" },
  { key: "global", label: "Dünya" },
];

interface Row {
  key: string;
  rank: number;
  name: string;
  score: number;
  sub?: string;
  isMe?: boolean;
  friendId?: string;
}

export default function LeaderboardScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("local");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const playerId = profile.playerId;

  const friendsQ = useQuery({
    queryKey: ["friends", playerId],
    queryFn: () => api.getFriends(playerId as string),
    enabled: !!playerId && tab === "friends",
  });
  const globalQ = useQuery({
    queryKey: ["leaderboard", playerId],
    queryFn: () => api.leaderboard(playerId),
    enabled: tab === "global",
  });

  const addFriend = useMutation({
    mutationFn: async (c: string) => {
      const id = playerId ?? (await profile.ensureOnline());
      if (!id) throw new ApiError(0, "Bağlantı yok");
      return api.addFriend(id, c);
    },
    onSuccess: (p) => {
      setCode("");
      setMessage({ text: `${p.nickname} eklendi!`, error: false });
      qc.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (e) => setMessage({ text: e instanceof Error ? e.message : "Bağlantı hatası", error: true }),
  });

  const removeFriend = useMutation({
    mutationFn: (friendId: string) => api.removeFriend(playerId as string, friendId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });

  const rows: Row[] =
    tab === "local"
      ? profile.localScores.map((s, i) => ({
          key: `${s.date}-${i}`,
          rank: i + 1,
          name: profile.nickname,
          score: s.score,
          sub: `${s.distance} m · ${s.coins} altın · ${new Date(s.date).toLocaleDateString("tr-TR")}`,
          isMe: i === 0,
        }))
      : tab === "friends"
        ? (friendsQ.data?.board ?? []).map((p) => toRow(p, p.is_me ? undefined : p.id))
        : (globalQ.data ?? []).map((p) => toRow(p));

  const loading = (tab === "friends" && friendsQ.isLoading) || (tab === "global" && globalQ.isLoading);
  const error = (tab === "friends" && friendsQ.isError) || (tab === "global" && globalQ.isError);

  return (
    <View style={styles.root} testID="leaderboard-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable testID="leaderboard-back-button" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Liderlik</Text>
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
              En iyi: <Text style={styles.meBold}>{profile.bestScore.toLocaleString("tr-TR")}</Text>
            </Text>
          </View>
          <Pressable testID="leaderboard-friend-code" onPress={() => router.push("/settings")} style={styles.codeBox}>
            <Text style={styles.codeLabel}>ARKADAŞ KODU</Text>
            <Text style={styles.code}>{profile.friendCode ?? "—"}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                testID={`leaderboard-tab-${t.key}`}
                accessibilityRole="tab"
                onPress={() => setTab(t.key)}
                style={[styles.chip, { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimaryShade : colors.border }]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{t.label}</Text>
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
              placeholder="Arkadaş kodu (örn. K7F2PX)"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => code.length >= 4 && addFriend.mutate(code)}
            />
            <ChunkyButton testID="friend-add-button" label="Ekle" icon="person-add" variant="secondary" disabled={code.length < 4 || addFriend.isPending} onPress={() => addFriend.mutate(code)} />
          </View>
        ) : null}
        {message && tab === "friends" ? (
          <Text testID="friend-message" style={[styles.message, { color: message.error ? colors.error : colors.success }]}>
            {message.text}
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.center} testID="leaderboard-loading">
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.emptyText}>Skorlar getiriliyor…</Text>
          </View>
        ) : error ? (
          <View style={styles.center} testID="leaderboard-error">
            <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>Bağlantı hatası</Text>
            <ChunkyButton testID="leaderboard-retry-button" label="Tekrar dene" variant="neutral" onPress={() => (tab === "friends" ? friendsQ.refetch() : globalQ.refetch())} />
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
                <Text style={styles.emptyText}>
                  {tab === "local" ? "Henüz koşu yok. İlk rekorunu kır!" : tab === "friends" ? "Henüz arkadaş eklenmedi. Kodunu paylaş, arkadaşının kodunu ekle." : "Henüz skor yok."}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <RankRow row={item} onRemove={item.friendId ? () => removeFriend.mutate(item.friendId as string) : undefined} />
            )}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function toRow(p: PlayerOut, friendId?: string): Row {
  return {
    key: p.id,
    rank: p.rank ?? 0,
    name: p.nickname,
    score: p.high_score,
    sub: `${p.runs} koşu · ${p.total_coins} altın`,
    isMe: p.is_me,
    friendId,
  };
}

function RankRow({ row, onRemove }: { row: Row; onRemove?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const medal = row.rank === 1 ? colors.gold : row.rank === 2 ? colors.silver : row.rank === 3 ? colors.bronze : colors.surfaceTertiary;
  return (
    <View style={[styles.row, row.isMe && { borderColor: colors.info }]} testID={`rank-row-${row.rank}`}>
      <View style={[styles.rank, { backgroundColor: medal }]}>
        <Text style={styles.rankText}>{row.rank}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.name}
          {row.isMe ? "  (sen)" : ""}
        </Text>
        {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
      </View>
      <Text style={styles.rowScore}>{row.score.toLocaleString("tr-TR")}</Text>
      {onRemove ? (
        <Pressable testID={`rank-row-remove-${row.rank}`} accessibilityRole="button" onPress={onRemove} hitSlop={8} style={styles.remove}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
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
  me: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2.5,
    borderColor: colors.borderStrong,
    borderBottomWidth: 5,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
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
  input: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.textBold,
    fontSize: 16,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
  },
  message: { fontFamily: fonts.textBold, fontSize: 13, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  emptyText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.muted, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rank: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary },
  rowSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  rowScore: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurfaceSecondary },
  remove: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
}));
