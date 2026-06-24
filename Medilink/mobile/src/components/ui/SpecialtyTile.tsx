import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Icon, type IconName, resolveIconName } from "./Icon";
import { Text } from "./Text";

export interface SpecialtyTileProps {
  name: string;
  /** Brand/data icon key (resolved onto the single-stroke set). */
  icon?: string;
  onPress?: () => void;
}

/** Specialty category tile — icon sub-tile + the category name in SEMIBOLD. */
export function SpecialtyTile({ name, icon, onPress }: SpecialtyTileProps) {
  const { colors, radii } = useTheme();
  const resolved: IconName = resolveIconName(icon ?? "medkit-outline");
  return (
    <AppCard variant="specialty" onPress={onPress} accessibilityLabel={name} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accent, borderRadius: radii.md }]}>
        <Icon name={resolved} size={24} tint={colors.primary} />
      </View>
      {/* Specialty names must be semibold/bold (audit) */}
      <Text variant="label" weight="700" align="center" numberOfLines={2} style={styles.label}>
        {name}
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", justifyContent: "center" },
  iconWrap: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  label: { marginTop: 8 },
});
