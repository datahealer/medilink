import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { HIT_TARGET } from "@/theme/tokens";
import { Icon } from "./Icon";

/**
 * Dev-only light/dark toggle. Hidden in production builds (gated by __DEV__) — the
 * real theme control will live in Settings (a later sprint).
 */
export function ThemeToggle() {
  const { colors, radii, scheme, toggle } = useTheme();
  const { t } = useI18n();
  // Dev-only: hidden in production builds (real control lives in Settings later).
  if (process.env.NODE_ENV === "production") return null;

  const toDark = scheme === "light";
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={toDark ? t("theme.toggleToDark") : t("theme.toggleToLight")}
      hitSlop={8}
      style={[styles.btn, { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill, borderColor: colors.border }]}
    >
      <Icon name={toDark ? "moon" : "sun"} size={20} tint={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
