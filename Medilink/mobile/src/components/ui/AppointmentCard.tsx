import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { PatternCard } from "./PatternCard";
import { Text } from "./Text";

export interface AppointmentCardProps {
  statusLabel: string; // e.g. "Upcoming" / "Next visit" — shown INSIDE the card
  doctorName: string;
  subtitle?: string; // facility · date · time
  initials: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  isRTL?: boolean;
}

/**
 * Filled violet appointment card (PDF dashboard artboard): official submark
 * watermark behind white content, "Upcoming" pill INSIDE the card, white avatar,
 * doctor info, and a white primary + ghost secondary action.
 */
export function AppointmentCard({
  statusLabel,
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
    <PatternCard variant="appointment" surface="primary" pattern="submark" patternPosition={isRTL ? "bottomLeft" : "bottomRight"}>
      <View style={[styles.top, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.pill}>
          <Text variant="caption" style={styles.pillText}>{statusLabel.toUpperCase()}</Text>
        </View>
      </View>
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.avatar}>
          <Text variant="title" style={{ color: colors.heroFrom }}>{initials}</Text>
        </View>
        <View style={[styles.info, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <Text variant="title" numberOfLines={1} style={{ color: "#FFFFFF" }} align={isRTL ? "right" : "left"}>{doctorName}</Text>
          {subtitle ? (
            <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.78)" }} align={isRTL ? "right" : "left"}>{subtitle}</Text>
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
  top: { alignItems: "center", marginBottom: 6 },
  pill: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { color: "#FFFFFF", letterSpacing: 0.6, fontSize: 10 },
  row: { alignItems: "center", marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  actions: { gap: 8, marginTop: 14 },
  primary: { flex: 1, minHeight: 46, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  secondary: { flex: 1, minHeight: 46, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
});
