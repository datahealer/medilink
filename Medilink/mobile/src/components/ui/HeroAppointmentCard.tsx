import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

const VIOLET = "#2E1A47"; // Russian Violet — crisp on the pastel gradient in both themes

export interface HeroAppointmentCardProps {
  statusLabel: string;
  /** Status dot/text colour (from apptTone.fg). */
  statusColor: string;
  relativeLabel?: string;
  doctorName: string;
  initials: string;
  subtitle?: string; // "Cardiology · Wed 18 Jun · 10:30 AM"
  checkInLabel: string;
  detailsLabel: string;
  onCheckIn?: () => void;
  onDetails?: () => void;
  isRTL?: boolean;
}

/**
 * Featured (first upcoming) appointment — full pastel gradient card with decorative
 * circles, a white status chip, doctor identity, and Check-in / Details actions.
 * Matches the approved Appointments artboard (light gradient, dark violet text).
 */
export function HeroAppointmentCard({
  statusLabel,
  statusColor,
  relativeLabel,
  doctorName,
  initials,
  subtitle,
  checkInLabel,
  detailsLabel,
  onCheckIn,
  onDetails,
  isRTL = false,
}: HeroAppointmentCardProps) {
  const { radii } = useTheme();
  return (
    <LinearGradient
      colors={["#DFC8E7", "#C3D7EE"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderRadius: radii.xl }]}
    >
      {/* Decorative background circles */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orb, styles.orbA]} />
        <View style={[styles.orb, styles.orbB]} />
      </View>

      {/* Status chip + relative time */}
      <View style={[styles.topRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.chip}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text variant="caption" weight="700" style={{ color: statusColor }}>{statusLabel}</Text>
        </View>
        {relativeLabel ? (
          <Text variant="caption" style={{ color: "rgba(46,26,71,0.72)" }}>{relativeLabel}</Text>
        ) : null}
      </View>

      {/* Doctor */}
      <View style={[styles.docRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={styles.avatar}>
          <Text variant="title" style={{ color: VIOLET }}>{initials}</Text>
        </View>
        <View style={[styles.info, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <Text variant="title" numberOfLines={1} style={{ color: VIOLET }} align={isRTL ? "right" : "left"}>
            {doctorName}
          </Text>
          {subtitle ? (
            <Text variant="caption" numberOfLines={2} style={{ color: "rgba(46,26,71,0.78)" }} align={isRTL ? "right" : "left"}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable
          onPress={onCheckIn}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: VIOLET, borderRadius: radii.md, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text variant="label" style={{ color: "#FFFFFF" }}>{checkInLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onDetails}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: "#FFFFFF", borderRadius: radii.md, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text variant="label" style={{ color: VIOLET }}>{detailsLabel}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, overflow: "hidden" },
  orb: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.28)" },
  orbA: { width: 150, height: 150, top: -54, right: -36 },
  orbB: { width: 90, height: 90, bottom: -30, left: -18, backgroundColor: "rgba(255,255,255,0.20)" },
  topRow: { alignItems: "center", justifyContent: "space-between" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  docRow: { alignItems: "center", marginTop: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1 },
  actions: { gap: 10, marginTop: 16 },
  primaryBtn: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", paddingVertical: 11 },
  secondaryBtn: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", paddingVertical: 11 },
});
