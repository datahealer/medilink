import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

interface UrgencyBadgeProps {
  /** Backend urgency level. */
  level: "self-care" | "see-doctor" | "urgent-24h" | "emergency" | string;
  /** Localized label to display. */
  label: string;
}

/**
 * Coloured triage pill: green (self-care) → orange (see a doctor / within 24h) → red
 * (emergency). Colours come from the theme so it adapts to light/dark automatically.
 */
export function UrgencyBadge({ level, label }: UrgencyBadgeProps) {
  const { colors } = useTheme();
  const bg =
    level === "emergency"
      ? colors.error
      : level === "urgent-24h"
        ? colors.warning
        : level === "see-doctor"
          ? colors.warning
          : colors.success;

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {level === "emergency" ? <Text style={styles.icon}>⚠️</Text> : null}
      <Text variant="caption" weight="700" style={styles.label}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, gap: 4 },
  icon: { fontSize: 12 },
  label: { color: "#fff", letterSpacing: 0.4 },
});
