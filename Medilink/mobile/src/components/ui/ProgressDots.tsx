import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";

export interface ProgressDotsProps {
  count: number;
  activeIndex: number;
}

/** Onboarding pagination dots. The active dot elongates into a pill. */
export function ProgressDots({ count, activeIndex }: ProgressDotsProps) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: count, now: activeIndex + 1 }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const active = i === activeIndex;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: active ? 22 : 8,
                backgroundColor: active ? colors.primary : colors.border,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  dot: { height: 8, borderRadius: 999 },
});
