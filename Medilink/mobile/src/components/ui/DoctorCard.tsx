import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { PatternCard } from "./PatternCard";
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
  const { colors, isRTL } = useTheme();

  // Doctor Details hero — violet orb card with white content + green availability.
  if (variant === "detail") {
    return (
      <PatternCard variant="detail" surface="primary" pattern="orbs" orbVariant="medium">
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.heroAvatar}>
            <Text variant="title" style={{ color: colors.heroFrom }}>{initials}</Text>
          </View>
          <View style={[styles.body, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
            <Text variant="h2" numberOfLines={2} style={{ color: "#FFFFFF" }} align={isRTL ? "right" : "left"}>{name}</Text>
            <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.80)" }} align={isRTL ? "right" : "left"}>{`${specialty} · ${facility}`}</Text>
            {availableTodayLabel ? (
              <View style={[styles.availHero, { alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
                <Text variant="caption" style={{ color: "#9FE7C4" }}>{availableTodayLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </PatternCard>
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
  heroAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  availHero: { marginTop: 6, borderWidth: 1, borderColor: "rgba(159,231,196,0.6)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
