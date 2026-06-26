import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import type { ApptTone } from "@/utils/appointments";
import { Avatar } from "./Avatar";
import { Card } from "./Card";
import { Text } from "./Text";

export interface AppointmentCompactCardProps {
  doctorName: string;
  subtitle?: string; // "Dermatology · Aster Clinic · 6:00 PM" or "Completed · 2 May"
  /** Upcoming: green status chip (top-left) + date (top-right). */
  statusLabel?: string;
  statusTone?: ApptTone;
  topRight?: string;
  /** Past: a tag pill on the trailing edge (e.g. appointment type). */
  pillLabel?: string;
  onPress?: () => void;
  isRTL?: boolean;
}

/** Compact white appointment card — used for non-hero upcoming and all past rows. */
export function AppointmentCompactCard({
  doctorName,
  subtitle,
  statusLabel,
  statusTone,
  topRight,
  pillLabel,
  onPress,
  isRTL = false,
}: AppointmentCompactCardProps) {
  const { colors, spacing } = useTheme();
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.sm }}>
      {statusLabel && statusTone ? (
        <View style={[styles.topRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.chip, { backgroundColor: statusTone.bg }]}>
            <View style={[styles.dot, { backgroundColor: statusTone.fg }]} />
            <Text variant="caption" weight="700" style={{ color: statusTone.fg }}>{statusLabel}</Text>
          </View>
          {topRight ? <Text variant="caption" color="textMuted">{topRight}</Text> : null}
        </View>
      ) : null}

      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }, statusLabel ? { marginTop: 10 } : null]}>
        <Avatar name={doctorName} size={44} />
        <View style={[styles.info, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{doctorName}</Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted" numberOfLines={2} align={isRTL ? "right" : "left"}>{subtitle}</Text>
          ) : null}
        </View>
        {pillLabel ? (
          <View style={[styles.pill, { backgroundColor: colors.accent }]}>
            <Text variant="caption" weight="700" style={{ color: colors.primary }}>{pillLabel}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: "center", justifyContent: "space-between" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  row: { alignItems: "center" },
  info: { flex: 1 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginStart: 8 },
});
