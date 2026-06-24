import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Text } from "./Text";

export interface DoctorCardProps {
  variant?: "searchResult" | "recent";
  name: string;
  specialty: string;
  facility: string;
  metaText?: string; // e.g. "★ 4.9   OMR 25 · 2.1 km" (already localized)
  availableTodayLabel?: string;
  visitedLabel?: string;
  bookLabel?: string;
  profileLabel?: string;
  onBook?: () => void;
  onProfile?: () => void;
  onPress?: () => void;
}

/** Search-result / recently-visited doctor card. Sized to the PDF (taller, padded). */
export function DoctorCard({
  variant = "searchResult",
  name,
  specialty,
  facility,
  metaText,
  availableTodayLabel,
  visitedLabel,
  bookLabel = "Book",
  profileLabel = "Profile",
  onBook,
  onProfile,
  onPress,
}: DoctorCardProps) {
  const { colors, isRTL } = useTheme();
  const isSearch = variant === "searchResult";
  return (
    <AppCard variant={isSearch ? "doctorList" : "recentDoctor"} onPress={onPress} accessibilityLabel={name}>
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Avatar name={name} size={48} />
        <View style={[styles.body, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <View style={[styles.titleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text variant="title" numberOfLines={1} style={styles.name} align={isRTL ? "right" : "left"}>{name}</Text>
            {availableTodayLabel ? (
              <View style={[styles.todayTag, { borderColor: colors.success }]}>
                <Text variant="caption" color="success" numberOfLines={1}>{availableTodayLabel}</Text>
              </View>
            ) : visitedLabel ? (
              <View style={[styles.visitedTag, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
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
  todayTag: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, marginStart: 6 },
  visitedTag: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, marginStart: 6 },
  actions: { gap: 8, marginTop: 10 },
  flex: { flex: 1 },
});
