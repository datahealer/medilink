import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppHeader, Icon, type IconName, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { ColorMode } from "@/stores/themeStore";

const OPTIONS: { value: ColorMode; label: "light" | "dark" | "system"; icon: IconName }[] = [
  { value: "light", label: "light", icon: "sun" },
  { value: "dark", label: "dark", icon: "moon" },
  { value: "system", label: "system", icon: "settings" },
];

/**
 * Appearance & Accessibility — theme selector (Light / Dark / System). Reads and
 * writes the persisted theme preference via the existing ThemeProvider/themeStore;
 * the choice applies app-wide immediately and survives restart (SecureStore).
 *
 * (Scope today = theme switching only. RTL/larger-text controls are part of the
 * later full PDF-fidelity pass.)
 */
export default function AppearanceScreen() {
  const { colors, spacing, radii, isRTL, mode, setMode } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("appearance.title")} />

      <Text variant="label" color="textMuted" style={{ marginBottom: spacing.sm }}>{t("appearance.theme")}</Text>
      <Text variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>{t("appearance.themeHint")}</Text>

      <View style={{ gap: spacing.sm }}>
        {OPTIONS.map((opt) => {
          const selected = mode === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setMode(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`appearance.${opt.label}`)}
              style={({ pressed }) => [
                styles.row,
                {
                  flexDirection: isRTL ? "row-reverse" : "row",
                  backgroundColor: colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  borderRadius: radii.lg,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
                <Icon name={opt.icon} size={20} tint={colors.primary} />
              </View>
              <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.md } : { marginStart: spacing.md }]}>
                <Text variant="title">{t(`appearance.${opt.label}`)}</Text>
                {opt.value === "system" ? (
                  <Text variant="caption" color="textMuted">{t("appearance.systemHint")}</Text>
                ) : null}
              </View>
              <Icon
                name={selected ? "radio-on" : "radio-off"}
                size={22}
                tint={selected ? colors.primary : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
