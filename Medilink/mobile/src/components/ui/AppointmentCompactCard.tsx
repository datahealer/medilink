import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import type { ApptTone } from "@/utils/appointments";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
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
  /** Inline actions (design p24, next/actionable card): [Check in] [Details]. */
  checkInLabel?: string;
  detailsLabel?: string;
  onCheckIn?: () => void;
  onDetails?: () => void;
  checkInLoading?: boolean;
  isRTL?: boolean;
}

/**
 * Compact appointment card (design p24) — status chip + date, avatar, name and
 * subtitle. Optionally renders inline [Check in] / [Details] actions for the
 * next actionable appointment; otherwise the whole card is tappable.
 */
export function AppointmentCompactCard({
  doctorName,
  subtitle,
  statusLabel,
  statusTone,
  topRight,
  pillLabel,
  onPress,
  checkInLabel,
  detailsLabel,
  onCheckIn,
  onDetails,
  checkInLoading = false,
  isRTL = false,
}: AppointmentCompactCardProps) {
  const { colors, spacing } = useTheme();
  const hasActions = Boolean((onCheckIn && checkInLabel) || (onDetails && detailsLabel));
  return (
    <Card onPress={hasActions ? undefined : onPress} style={{ marginBottom: spacing.sm }}>
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

      {hasActions ? (
        <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {onCheckIn && checkInLabel ? (
            <View style={styles.actionItem}>
              <Button label={checkInLabel} onPress={onCheckIn} loading={checkInLoading} />
            </View>
          ) : null}
          {onDetails && detailsLabel ? (
            <View style={styles.actionItem}>
              <Button variant="outline" label={detailsLabel} onPress={onDetails} />
            </View>
          ) : null}
        </View>
      ) : null}
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
  actions: { marginTop: 12, gap: 8 },
  actionItem: { flex: 1 },
});
