import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { DISTRICT_ORDER, DISTRICTS, nextDistrict } from "@/src/game/districts";
import { useT } from "@/src/i18n";
import { useProfile } from "@/src/profile";
import { TOKENS_PER_DISTRICT } from "@/src/progress";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Ferry pier: pick the district to run in; locked ones show their token progress. */
export default function PierScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const t = useT();
  const p = profile.progress;

  return (
    <View style={styles.root} testID="pier-screen">
      <ScreenHeader title={t("pier.title")} testID="pier" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.subtitle}>{t("pier.subtitle")}</Text>
        {DISTRICT_ORDER.map((id, i) => {
          const def = DISTRICTS[id];
          const unlocked = p.unlocked.includes(id);
          const current = p.current === id;
          const prev = i > 0 ? DISTRICT_ORDER[i - 1] : null;
          const have = prev ? (p.tokens[prev] ?? 0) : 0;
          const next = nextDistrict(id);
          const done = next ? p.unlocked.includes(next) : false;
          return (
            <Pressable
              key={id}
              testID={`pier-${id}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !unlocked, selected: current }}
              disabled={!unlocked}
              onPress={() => profile.selectDistrict(id)}
              style={[styles.card, current && { borderColor: colors.info }, !unlocked && styles.locked]}
            >
              <View style={[styles.swatch, { backgroundColor: hex(def.sky) }]}>
                <View style={[styles.swatchStreet, { backgroundColor: hex(def.buildingColors[0]) }]} />
                <Ionicons name={unlocked ? "boat" : "lock-closed"} size={22} color="#FFFFFF" style={styles.swatchIcon} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{t(def.name)}</Text>
                <Text style={styles.help}>
                  {unlocked ? (current ? t("pier.current") : t("pier.open")) : t("pier.locked", { have: Math.min(have, TOKENS_PER_DISTRICT) })}
                </Text>
                {unlocked && next ? (
                  <View style={styles.tokens}>
                    {Array.from({ length: TOKENS_PER_DISTRICT }, (_, k) => (
                      <View key={k} style={[styles.token, { backgroundColor: done || k < (p.tokens[id] ?? 0) ? colors.info : colors.surfaceTertiary }]} />
                    ))}
                    <Text style={styles.help}>{done ? t("pier.done") : t("pier.tokens", { have: p.tokens[id] ?? 0 })}</Text>
                  </View>
                ) : null}
              </View>
              {current ? <Ionicons name="checkmark-circle" size={26} color={colors.info} /> : null}
            </Pressable>
          );
        })}
        <Text style={styles.help}>{t("pier.howTo")}</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  subtitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 2.5, borderColor: colors.border, borderBottomWidth: 5, borderRadius: radius.lg, padding: spacing.md },
  locked: { opacity: 0.6 },
  swatch: { width: 64, height: 64, borderRadius: radius.md, overflow: "hidden", justifyContent: "flex-end" },
  swatchStreet: { height: 26 },
  swatchIcon: { position: "absolute", top: 8, left: 21 },
  info: { flex: 1, gap: 4 },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurfaceSecondary },
  help: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  tokens: { flexDirection: "row", alignItems: "center", gap: 6 },
  token: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong },
}));
