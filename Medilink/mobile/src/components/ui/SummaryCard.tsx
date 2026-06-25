import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Text } from "./Text";

export interface SummaryRow {
  label: string;
  value: string;
}

export interface SummaryCardProps {
  rows: SummaryRow[];
}

/** Labelled key/value summary card (booking review, appointment details). */
export function SummaryCard({ rows }: SummaryCardProps) {
  const { colors, isRTL } = useTheme();
  return (
    <AppCard variant="detail">
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={[
            styles.row,
            { flexDirection: isRTL ? "row-reverse" : "row" },
            i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border, marginTop: 10, paddingTop: 10 } : null,
          ]}
        >
          <Text variant="caption" color="textMuted">{r.label}</Text>
          <Text variant="label" align={isRTL ? "left" : "right"} style={styles.value}>{r.value}</Text>
        </View>
      ))}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start", justifyContent: "space-between" },
  value: { flex: 1, marginStart: 12 },
});
