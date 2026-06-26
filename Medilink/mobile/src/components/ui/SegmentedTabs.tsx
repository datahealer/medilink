import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

export interface SegmentedTab<T extends string = string> {
  key: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string = string> {
  tabs: SegmentedTab<T>[];
  active: T;
  onChange: (key: T) => void;
}

/** Pill segmented control (e.g. Upcoming / Past). RTL-aware; reusable. */
export function SegmentedTabs<T extends string = string>({ tabs, active, onChange }: SegmentedTabsProps<T>) {
  const { colors, radii, isRTL } = useTheme();
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill, flexDirection: isRTL ? "row-reverse" : "row" },
      ]}
      accessibilityRole="tablist"
    >
      {tabs.map((t) => {
        const sel = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            style={[
              styles.seg,
              { borderRadius: radii.pill, backgroundColor: sel ? colors.surface : "transparent" },
              sel ? styles.segActive : null,
            ]}
          >
            <Text variant="label" align="center" style={{ color: sel ? colors.primary : colors.textMuted }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { padding: 4 },
  seg: { flex: 1, paddingVertical: 9, alignItems: "center" },
  segActive: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
