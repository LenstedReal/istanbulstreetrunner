import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CoinIcon } from "@/src/components/CoinIcon";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { StatPill } from "@/src/components/StatPill";
import { fmt, upper, useT } from "@/src/i18n";
import { useProfile } from "@/src/profile";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";
import { CATALOG, type Item, type ItemKind } from "@/src/wardrobe";

const SECTIONS: ItemKind[] = ["runner", "cap", "jacket", "shoes"];
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Wardrobe shop: runners and clothes bought with coins collected in runs. */
export default function ShopScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const w = profile.wardrobe;

  const onItem = async (it: Item) => {
    setMsg(null);
    if (w.owned.includes(it.id)) {
      await profile.equipItem(it.id);
      return;
    }
    const ok = await profile.buyItem(it.id);
    if (!ok) setMsg(t("shop.notEnough"));
  };

  return (
    <View style={styles.root} testID="shop-screen">
      <ScreenHeader title={t("shop.title")} testID="shop" right={<StatPill testID="shop-balance" tone="dark" leading={<CoinIcon size={18} />} value={fmt(profile.coins)} />} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        {SECTIONS.map((kind) => {
          const items = CATALOG.filter((i) => i.kind === kind);
          return (
            <View key={kind} style={styles.section}>
              <Text style={styles.sectionTitle}>{upper(t(items[0].section))}</Text>
              <View style={styles.grid}>
                {items.map((it) => {
                  const owned = w.owned.includes(it.id);
                  const equipped = w[it.kind] === it.id || (it.kind === "runner" && w.runner === it.id);
                  const color = it.look ? it.look.jacket : (it.color ?? 0xffffff);
                  const color2 = it.look ? it.look.skin : (it.color2 ?? color);
                  return (
                    <Pressable
                      key={it.id}
                      testID={`shop-item-${it.id}`}
                      accessibilityRole="button"
                      onPress={() => onItem(it)}
                      style={[styles.item, equipped && { borderColor: colors.info }]}
                    >
                      <View style={[styles.preview, { backgroundColor: hex(color) }]}>
                        <View style={[styles.previewDot, { backgroundColor: hex(color2) }]} />
                        {it.kind === "runner" ? <Ionicons name="person" size={26} color="#FFFFFF" style={styles.previewIcon} /> : null}
                      </View>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {it.label}
                      </Text>
                      <View style={[styles.tag, { backgroundColor: equipped ? colors.info : owned ? colors.surfaceTertiary : colors.brandTertiary }]}>
                        {!owned ? <CoinIcon size={14} /> : null}
                        <Text style={[styles.tagText, { color: equipped ? colors.onInfo : colors.onSurfaceTertiary }]}>
                          {equipped ? t("shop.equipped") : owned ? t("shop.equip") : fmt(it.price)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.lg },
  msg: { fontFamily: fonts.textBold, fontSize: 14, color: colors.error, textAlign: "center" },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.textHeavy, fontSize: 12, letterSpacing: 1.5, color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  item: { width: "31%", flexGrow: 1, maxWidth: 160, alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary, borderWidth: 2.5, borderColor: colors.border, borderBottomWidth: 5, borderRadius: radius.lg, padding: spacing.sm },
  preview: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.borderStrong },
  previewDot: { position: "absolute", right: 2, bottom: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong },
  previewIcon: { textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 3 },
  itemName: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurfaceSecondary, textAlign: "center", minHeight: 32 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, height: 26, borderRadius: radius.pill },
  tagText: { fontFamily: fonts.textHeavy, fontSize: 12 },
}));
