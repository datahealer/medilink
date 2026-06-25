import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";

export interface StepperProps {
  /** 1-based count of completed/active steps. */
  current: number;
  total: number;
}

/**
 * Thin segmented progress bar for multi-step flows (e.g. the 4-step booking).
 * Segments up to `current` use the primary colour; the rest use the border tint.
 */
export function Stepper({ current, total }: StepperProps) {
  const { colors, isRTL } = useTheme();
  return (
    <View
      style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.seg, { backgroundColor: i < current ? colors.primary : colors.border }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  seg: { flex: 1, height: 5, borderRadius: 999 },
});
