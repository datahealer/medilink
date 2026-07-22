import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

export interface SlotGridProps {
  /** Time-slot labels (already localized, e.g. "10:30"). */
  slots: string[];
  selected?: string;
  onSelect: (slot: string) => void;
  emptyLabel?: string;
}

/** Wrapping grid of selectable time-slot pills (booking step 1). ~3 per row. */
export function SlotGrid({ slots, selected, onSelect, emptyLabel }: SlotGridProps) {
  const { colors, radii, isRTL } = useTheme();
  if (!slots.length) {
    return emptyLabel ? <Text variant="body" color="textMuted">{emptyLabel}</Text> : null;
  }
  return (
    <View style={[styles.wrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      {slots.map((s) => {
        const sel = s === selected;
        return (
          <Pressable
            key={s}
            onPress={() => onSelect(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            style={[
              styles.slot,
              { borderRadius: radii.pill, backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border },
            ]}
          >
            <Text variant="label" align="center" style={{ color: sel ? colors.textOnPrimary : colors.text }}>
              {s}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: "wrap", gap: 8 },
  slot: { flexGrow: 1, flexBasis: "30%", minWidth: 88, paddingVertical: 11, alignItems: "center", borderWidth: 1 },
});
