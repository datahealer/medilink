import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { Text } from "./Text";

export interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  error?: boolean;
}

/** Accessible checkbox with an optional inline label (≥44pt row target). */
export function Checkbox({ checked, onChange, label, error = false }: CheckboxProps) {
  const { colors, radii, isRTL } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}
    >
      <View
        style={[
          styles.box,
          {
            borderRadius: radii.sm,
            backgroundColor: checked ? colors.primary : "transparent",
            borderColor: error ? colors.error : checked ? colors.primary : colors.border,
          },
        ]}
      >
        {checked ? <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} /> : null}
      </View>
      {label ? (
        <Text variant="body" style={styles.label}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", minHeight: HIT_TARGET, gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1 },
});
