import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLang, useT } from "@/src/i18n";
import { LEGAL_BASE_URL, LEGAL_PAGES, LEGAL_UPDATED, legalText, type LegalDoc } from "@/src/legal";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, spacing } from "@/src/tokens";

const LINK = /(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g;

/** Paragraph with tappable web addresses and e-mail addresses. */
function Rich({ text, style, linkStyle }: { text: string; style: object; linkStyle: object }) {
  const parts = text.split(LINK);
  return (
    <Text style={style} selectable>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={linkStyle} onPress={() => Linking.openURL(part.includes("@") && !part.startsWith("http") ? `mailto:${part}` : part).catch(() => undefined)}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function LegalScreen({ doc }: { doc: LegalDoc }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = useLang();
  const t = useT();
  const text = legalText(doc, lang);
  const date = new Date(`${LEGAL_UPDATED}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const close = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

  return (
    <View style={styles.root} testID={`legal-${doc}`}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" onPress={close} style={styles.back} testID="legal-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {text.title}
        </Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Text style={styles.updated}>{t("legal.updated", { date })}</Text>
        <Rich text={text.intro} style={styles.p} linkStyle={styles.link} />
        {text.sections.map((s) => (
          <View key={s.h} style={styles.section}>
            <Text style={styles.h}>{s.h}</Text>
            {s.p.map((p, i) => (
              <Rich key={i} text={p} style={styles.p} linkStyle={styles.link} />
            ))}
          </View>
        ))}
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(`${LEGAL_BASE_URL}/${LEGAL_PAGES[doc]}`).catch(() => undefined)}
          style={styles.web}
          testID="legal-web-link"
        >
          <Ionicons name="globe-outline" size={18} color={colors.info} />
          <Text style={styles.link}>{t("settings.website")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  content: { padding: spacing.lg, gap: spacing.md },
  updated: { fontFamily: fonts.textBold, fontSize: 12, color: colors.muted },
  section: { gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  h: { fontFamily: fonts.textHeavy, fontSize: 15, color: colors.onSurfaceSecondary },
  p: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: colors.onSurfaceSecondary },
  link: { fontFamily: fonts.textBold, color: colors.info, textDecorationLine: "underline" },
  web: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "center", padding: spacing.md },
}));
