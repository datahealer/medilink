import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Show a trailing ✕ that calls onRemove (removable chip). */
  onRemove?: () => void;
  accessibilityLabel?: string;
}

/** Pill chip — used for selectable options (relationship/gender) and removable tags. */
export function Chip({ label, selected = false, onPress, onRemove, accessibilityLabel }: ChipProps) {
  const { colors, radii, spacing, isRTL } = useTheme();

  const body = (
    <View
      style={[
        styles.chip,
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          borderRadius: radii.pill,
          paddingHorizontal: spacing.md,
          backgroundColor: selected ? colors.primary : colors.surfaceAlt,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text variant="label" color={selected ? "textOnPrimary" : "text"}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}
        >
          <Ionicons
            name="close"
            size={14}
            color={selected ? colors.textOnPrimary : colors.textMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: 6,
  },
});

export const CHIP_MIN_TOUCH = HIT_TARGET;
