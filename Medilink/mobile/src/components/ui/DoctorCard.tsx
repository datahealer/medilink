import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { OrbPattern } from "./OrbPattern";
import { Text } from "./Text";

export interface DoctorCardProps {
  variant?: "searchResult" | "recent" | "detail";
  name: string;
  specialty: string;
  facility: string;
  metaText?: string; // "★ 4.9   OMR 25 · 2.1 km" (already localized)
  availableTodayLabel?: string;
  visitedLabel?: string;
  initials?: string;
  bookLabel?: string;
  profileLabel?: string;
  onBook?: () => void;
  onProfile?: () => void;
  onPress?: () => void;
}

/** Doctor cards: search-result / recently-visited (white) and the violet orb detail header. */
export function DoctorCard({
  variant = "searchResult",
  name,
  specialty,
  facility,
  metaText,
  availableTodayLabel,
  visitedLabel,
  initials = "",
  bookLabel = "Book",
  profileLabel = "Profile",
  onBook,
  onProfile,
  onPress,
}: DoctorCardProps) {
  const { colors, radii, scheme, isRTL } = useTheme();

  // Doctor Details header — a tall surface card with faint orbs, a large gradient
  // avatar, dark/light name and a filled green availability pill (PDF artboard).
  if (variant === "detail") {
    const pillBg = scheme === "dark" ? "rgba(95,207,155,0.18)" : "#D7F0E2";
    return (
      <AppCard variant="detail" accessibilityLabel={name} style={styles.detailCard}>
        <OrbPattern variant="medium" color={colors.primary} intensity={0.5} radius={radii.lg} />
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.detailAvatar}>
            <Svg style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="docAvatar" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#DFC8E7" />
                  <Stop offset="1" stopColor="#C3D7EE" />
                </LinearGradient>
              </Defs>
              <Circle cx="50%" cy="50%" r="50%" fill="url(#docAvatar)" />
            </Svg>
            <Text variant="h2" style={styles.detailInitials}>{initials}</Text>
          </View>
          <View style={[styles.body, isRTL ? { marginEnd: 14 } : { marginStart: 14 }]}>
            <Text variant="h2" numberOfLines={2} color="text" align={isRTL ? "right" : "left"}>{name}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={2} align={isRTL ? "right" : "left"}>{`${specialty} · ${facility}`}</Text>
            {availableTodayLabel ? (
              <View style={[styles.availPill, { backgroundColor: pillBg, alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
                <Text variant="caption" weight="600" style={{ color: colors.success }}>{availableTodayLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </AppCard>
    );
  }

  const isSearch = variant === "searchResult";
  return (
    <AppCard variant={isSearch ? "doctorList" : "recentDoctor"} onPress={onPress} accessibilityLabel={name}>
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Avatar name={name} size={48} />
        <View style={[styles.body, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <View style={[styles.titleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text variant="title" numberOfLines={1} style={styles.name} align={isRTL ? "right" : "left"}>{name}</Text>
            {availableTodayLabel ? (
              <View style={[styles.tag, { borderColor: colors.success }]}>
                <Text variant="caption" color="success" numberOfLines={1}>{availableTodayLabel}</Text>
              </View>
            ) : visitedLabel ? (
              <View style={[styles.tag, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text variant="caption" color="textMuted">{visitedLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{`${specialty} · ${facility}`}</Text>
          {metaText ? <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>{metaText}</Text> : null}
          {isSearch ? (
            <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.flex}><Button label={bookLabel} onPress={onBook} /></View>
              <View style={styles.flex}><Button label={profileLabel} variant="outline" onPress={onProfile} /></View>
            </View>
          ) : null}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start" },
  body: { flex: 1 },
  titleRow: { alignItems: "center" },
  name: { flex: 1, flexShrink: 1 },
  tag: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, marginStart: 6 },
  actions: { gap: 8, marginTop: 10 },
  flex: { flex: 1 },
  detailCard: { minHeight: 140, justifyContent: "center" },
  detailAvatar: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  detailInitials: { color: "#2E1A47" },
  availPill: { marginTop: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
