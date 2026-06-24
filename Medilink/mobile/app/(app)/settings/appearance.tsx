import React from "react";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";

import { AppHeader, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useLocale } from "@/hooks/useLocale";
import { useI18n } from "@/i18n";
import { useThemeStore, LARGE_TEXT_SCALE } from "@/stores/themeStore";
import type { ColorMode } from "@/stores/themeStore";

const THEMES: { value: ColorMode; label: "light" | "dark" | "system" }[] = [
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
  { value: "system", label: "system" },
];

/**
 * Appearance & Accessibility (PDF p34/p40): theme **preview tiles** (Light/Dark/System),
 * an **Arabic RTL layout** toggle with a live preview, and a **Larger text** toggle.
 */
export default function AppearanceScreen() {
  const { colors, spacing, radii, isRTL, mode, setMode } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const { changeLocale } = useLocale();
  const textScale = useThemeStore((s) => s.textScale);
  const setLargerText = useThemeStore((s) => s.setLargerText);

  const onToggleRTL = (on: boolean) => {
    const restart = changeLocale(on ? "ar" : "en");
    if (restart) Alert.alert(t("common.restartTitle"), t("common.restartBody"));
  };

  // Mini mock surfaces for the theme tiles.
  const tileColors = (v: ColorMode) =>
    v === "dark"
      ? { bg: "#160E26", bar: "#DFC8E7" }
      : v === "light"
        ? { bg: "#F9F4FA", bar: "#2E1A47" }
        : { bg: "#9A8FB0", bar: "#FFFFFF" };

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("appearance.title")} />

      <Text variant="label" color="textMuted" style={{ marginBottom: spacing.sm, letterSpacing: 0.5 }}>{t("appearance.theme").toUpperCase()}</Text>
      <View style={[styles.tiles, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {THEMES.map((opt) => {
          const selected = mode === opt.value;
          const c = tileColors(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => setMode(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`appearance.${opt.label}`)}
              style={styles.tileCell}
            >
              <View style={[styles.tile, { backgroundColor: c.bg, borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 2 : 1, borderRadius: radii.md }]}>
                <View style={[styles.tileBar, { backgroundColor: c.bar }]} />
                <View style={[styles.tileBarSm, { backgroundColor: c.bar, opacity: 0.5 }]} />
              </View>
              <Text variant="caption" align="center" color={selected ? "primary" : "textMuted"} style={{ marginTop: 6 }}>
                {t(`appearance.${opt.label}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Arabic (RTL) layout */}
      <View style={[styles.row, { borderColor: colors.border, borderRadius: radii.lg, flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.lg }]}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{t("appearance.rtlTitle")}</Text>
          <Text variant="caption" color="textMuted">{t("appearance.rtlHint")}</Text>
        </View>
        <Switch
          value={isRTL}
          onValueChange={onToggleRTL}
          trackColor={{ true: colors.primaryMuted, false: colors.border }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Arabic preview — labelled and bordered so it reads as part of the RTL section */}
      <View style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.lg }]}>
        <Text variant="caption" color="textMuted" style={{ marginBottom: 6, letterSpacing: 0.5 }}>{t("appearance.preview").toUpperCase()}</Text>
        <Text variant="h2" align="right" style={{ writingDirection: "rtl" }}>معاينة عربية</Text>
        <Text variant="caption" color="textMuted" align="right" style={{ writingDirection: "rtl" }}>رابطك لرعاية أفضل</Text>
      </View>

      {/* Larger text */}
      <View style={[styles.row, { borderColor: colors.border, borderRadius: radii.lg, flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{t("appearance.largerText")}</Text>
          <Text variant="caption" color="textMuted">{t("appearance.largerTextHint")}</Text>
        </View>
        <Switch
          value={textScale >= LARGE_TEXT_SCALE}
          onValueChange={setLargerText}
          trackColor={{ true: colors.primaryMuted, false: colors.border }}
          thumbColor="#FFFFFF"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { gap: 12 },
  tileCell: { flex: 1 },
  tile: { height: 84, padding: 10, justifyContent: "flex-end", gap: 6 },
  tileBar: { height: 8, width: "70%", borderRadius: 4 },
  tileBarSm: { height: 6, width: "45%", borderRadius: 3 },
  row: { alignItems: "center", borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  preview: { padding: 14, marginTop: 8, borderWidth: 1 },
});
