import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface FamilyMemberCardProps {
  name: string;
  subtitle?: string; // relation · age
  active?: boolean;
  activeLabel?: string;
  showChevron?: boolean;
  onPress?: () => void;
}

/** Family member / switch-profile row card — avatar, name, relation·age, active badge, chevron. */
export function FamilyMemberCard({ name, subtitle, active, activeLabel = "Active", showChevron = true, onPress }: FamilyMemberCardProps) {
  const { colors, isRTL } = useTheme();
  return (
    <AppCard
      variant="familyMember"
      onPress={onPress}
      accessibilityLabel={name}
      style={active ? { borderColor: colors.primary } : undefined}
    >
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Avatar name={name} size={44} />
        <View style={[styles.text, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{name}</Text>
          {subtitle ? <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>{subtitle}</Text> : null}
        </View>
        {active ? (
          <View style={[styles.badge, { backgroundColor: colors.success }]}>
            <Text variant="caption" color="textOnPrimary">{activeLabel}</Text>
          </View>
        ) : null}
        {showChevron ? <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} /> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  text: { flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginHorizontal: 6 },
});
