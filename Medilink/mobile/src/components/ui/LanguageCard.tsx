import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface LanguageCardProps {
  /** Short code badge, e.g. "EN" / "ع". */
  code: string;
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  /** Force a script direction for the label (Arabic shown RTL even in an EN UI). */
  labelRTL?: boolean;
}

/** Selectable language option (Language selection screen). */
export function LanguageCard({ code, label, hint, selected, onPress, labelRTL }: LanguageCardProps) {
  const { colors, radii } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.card,
        {
          borderRadius: radii.md,
          backgroundColor: colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
        },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: colors.accent, borderRadius: radii.sm }]}>
        <Text variant="title" color="primary" align="center">
          {code}
        </Text>
      </View>
      <View style={styles.textCol}>
        <Text variant="title" align={labelRTL ? "right" : "left"} style={labelRTL ? { writingDirection: "rtl" } : undefined}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="textMuted" align={labelRTL ? "right" : "left"}>
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="done-circle" size={24} tint={colors.primary} filled /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: HIT_TARGET + 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 14,
  },
  badge: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  textCol: { flex: 1 },
});
