import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { PatternCard } from "./PatternCard";
import { Text } from "./Text";

export interface AppointmentCardProps {
  statusLabel: string; // e.g. "Upcoming" — shown as a pill INSIDE the card
  relativeLabel?: string; // e.g. "in 2 days" — right of the pill
  doctorName: string;
  subtitle?: string; // concise: "General Care · Today 4:30 PM"
  initials: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  isRTL?: boolean;
}

/**
 * Filled violet appointment card (PDF dashboard/appointments artboards): the official
 * soft orb pattern behind white content, an "UPCOMING" pill + relative-time on one
 * row, a white avatar, doctor info, and a white primary + ghost secondary action.
 */
export function AppointmentCard({
  statusLabel,
  relativeLabel,
  doctorName,
  subtitle,
  initials,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  isRTL = false,
}: AppointmentCardProps) {
  const { colors, radii } = useTheme();
  return (
    <PatternCard variant="appointment" surface="primary" pattern="orbs" orbVariant="large">
      <View style={[styles.top, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.pill}>
          <Text variant="caption" style={styles.pillText}>{statusLabel.toUpperCase()}</Text>
        </View>
        {relativeLabel ? (
          <Text variant="caption" style={styles.relative}>{relativeLabel}</Text>
        ) : null}
      </View>
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.avatar}>
          <Text variant="title" style={{ color: colors.heroFrom }}>{initials}</Text>
        </View>
        <View style={[styles.info, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <Text variant="title" numberOfLines={1} style={{ color: "#FFFFFF" }} align={isRTL ? "right" : "left"}>{doctorName}</Text>
          {subtitle ? (
            <Text variant="caption" numberOfLines={2} style={{ color: "rgba(255,255,255,0.80)" }} align={isRTL ? "right" : "left"}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={onPrimary} accessibilityRole="button" style={({ pressed }) => [styles.primary, { borderRadius: radii.md, opacity: pressed ? 0.9 : 1 }]}>
          <Text variant="title" style={{ color: colors.heroFrom }}>{primaryLabel}</Text>
        </Pressable>
        <Pressable onPress={onSecondary} accessibilityRole="button" style={({ pressed }) => [styles.secondary, { borderRadius: radii.md, opacity: pressed ? 0.85 : 1 }]}>
          <Text variant="title" style={{ color: "#FFFFFF" }}>{secondaryLabel}</Text>
        </Pressable>
      </View>
    </PatternCard>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  pill: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: "#FFFFFF", letterSpacing: 0.6, fontSize: 10 },
  relative: { color: "rgba(255,255,255,0.80)" },
  row: { alignItems: "center", marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  actions: { gap: 10, marginTop: 16 },
  primary: { flex: 1, minHeight: 48, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  secondary: { flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
});
