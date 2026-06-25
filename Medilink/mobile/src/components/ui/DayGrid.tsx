import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

export interface DayItem {
  id: string;
  /** Weekday label (e.g. "Wed"). */
  top: string;
  /** Day-of-month label (already localized, e.g. "18"). */
  bottom: string;
}

export interface DayGridProps {
  items: DayItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/** Horizontal day selector (booking step 1). Equal-width cells; selected fills primary. */
export function DayGrid({ items, selectedId, onSelect }: DayGridProps) {
  const { colors, radii, isRTL } = useTheme();
  return (
    <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      {items.map((d) => {
        const sel = d.id === selectedId;
        return (
          <Pressable
            key={d.id}
            onPress={() => onSelect(d.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            style={[
              styles.cell,
              { borderRadius: radii.md, backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border },
            ]}
          >
            <Text variant="caption" align="center" style={{ color: sel ? colors.textOnPrimary : colors.textMuted }}>
              {d.top}
            </Text>
            <Text variant="title" align="center" style={{ color: sel ? colors.textOnPrimary : colors.text, marginTop: 2 }}>
              {d.bottom}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  cell: { flex: 1, paddingVertical: 10, alignItems: "center", borderWidth: 1 },
});
