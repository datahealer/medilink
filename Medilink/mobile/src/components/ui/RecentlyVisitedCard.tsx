import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Avatar } from "./Avatar";
import { Text } from "./Text";

export interface RecentlyVisitedCardProps {
  name: string;
  specialty: string;
  facility: string;
  /** "★ 4.9 · OMR 25" — already localized by the caller. */
  metaText?: string;
  visitedLabel: string;
  onPress?: () => void;
}

/**
 * Compact "Recently visited" doctor card (PDF dashboard). Deliberately denser than
 * the Search result card: smaller avatar, two text lines, and a muted "Visited" pill
 * anchored top-right on the name row. No action buttons.
 */
export function RecentlyVisitedCard({
  name,
  specialty,
  facility,
  metaText,
  visitedLabel,
  onPress,
}: RecentlyVisitedCardProps) {
  const { colors, isRTL } = useTheme();
  return (
    <AppCard variant="recentDoctor" onPress={onPress} accessibilityLabel={name}>
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Avatar name={name} size={40} />
        <View style={[styles.body, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <View style={[styles.titleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text variant="label" weight="700" numberOfLines={1} style={styles.name} align={isRTL ? "right" : "left"}>
              {name}
            </Text>
            <View style={[styles.pill, { backgroundColor: colors.accent }]}>
              <Text variant="caption" weight="600" style={{ color: colors.primary }} numberOfLines={1}>
                {visitedLabel}
              </Text>
            </View>
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
            {`${specialty} · ${facility}`}
          </Text>
          {metaText ? (
            <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
              {metaText}
            </Text>
          ) : null}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  body: { flex: 1 },
  titleRow: { alignItems: "center" },
  name: { flex: 1, flexShrink: 1 },
  pill: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginStart: 8 },
});
