import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Icon, type IconName } from "./Icon";
import { BrandIcon, type BrandIconName } from "./BrandIcon";
import { Text } from "./Text";

export interface HubActionTileProps {
  label: string;
  /** Use a brand Highlights icon (preferred where the concept matches) … */
  brandIcon?: BrandIconName;
  /** … or a single-stroke UI icon otherwise. */
  icon?: IconName;
  onPress?: () => void;
}

/**
 * Me Care Hub tile (PDF dashboard): a white card with the icon inside a lavender
 * rounded-square sub-tile, label below in semibold. Sized to the larger artboard tile.
 */
export function HubActionTile({ label, brandIcon, icon, onPress }: HubActionTileProps) {
  const { colors, radii } = useTheme();
  return (
    <AppCard variant="specialty" onPress={onPress} accessibilityLabel={label} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accent, borderRadius: radii.md }]}>
        {brandIcon ? (
          <BrandIcon name={brandIcon} size={26} color="primary" />
        ) : (
          <Icon name={icon ?? "ai"} size={24} tint={colors.primary} />
        )}
      </View>
      <Text variant="label" weight="600" align="center" numberOfLines={2} style={styles.label}>
        {label}
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", justifyContent: "center" },
  iconWrap: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  label: { marginTop: 8 },
});
