import Ionicons from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { DISTRICT_ORDER, DISTRICTS } from "@/src/game/districts";
import { fmt, useT } from "@/src/i18n";
import { useProfile } from "@/src/profile";
import { GOALS } from "@/src/progress";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Ferry pier: districts are levels; a locked one opens when the previous goal is done. */
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
          const done = p.done.includes(id);
          const prev = i > 0 ? DISTRICT_ORDER[i - 1] : null;
          const goal = GOALS[id];
          const best = p.best[id];
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
                <Text style={styles.swatchLevel}>{i + 1}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.level}>{t("level.n", { n: i + 1 })}</Text>
                <Text style={styles.name}>{t(def.name)}</Text>
                {unlocked ? (
                  <View style={styles.goalRow}>
                    <Ionicons name={done ? "checkmark-circle" : "flag"} size={15} color={done ? colors.success : colors.info} />
                    <Text style={[styles.help, done && { color: colors.success }]}>
                      {done ? t("goal.done") : t("goal.text", { distance: fmt(goal.distance), coins: fmt(goal.coins) })}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.goalRow}>
                    <Ionicons name="lock-closed" size={14} color={colors.muted} />
                    <Text style={styles.help}>{prev ? t("pier.lockedBy", { name: t(DISTRICTS[prev].name) }) : ""}</Text>
                  </View>
                )}
                {unlocked && best ? <Text style={styles.help}>{t("pier.best", { distance: fmt(best.distance), coins: fmt(best.coins) })}</Text> : null}
              </View>
              {current ? <Ionicons name="checkmark-circle" size={26} color={colors.info} /> : unlocked ? <Ionicons name="chevron-forward" size={22} color={colors.muted} /> : null}
            </Pressable>
          );
        })}
        <Text style={styles.help}>{t("pier.levelInfo")}</Text>
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
  swatch: { width: 64, height: 64, borderRadius: radius.md, overflow: "hidden", justifyContent: "flex-end", alignItems: "center" },
  swatchStreet: { position: "absolute", left: 0, right: 0, bottom: 0, height: 26 },
  swatchLevel: { fontFamily: fonts.display, fontSize: 30, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 4, marginBottom: 10 },
  info: { flex: 1, gap: 3 },
  level: { fontFamily: fonts.textHeavy, fontSize: 11, letterSpacing: 1, color: colors.info },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurfaceSecondary },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  help: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, flexShrink: 1 },
}));
