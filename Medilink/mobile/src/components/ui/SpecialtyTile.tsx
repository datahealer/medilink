import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { shadow } from "@/utils/platform";
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
    <AppCard variant="specialty" backgroundColor={colors.accent} bordered={false} onPress={onPress} accessibilityLabel={name} style={styles.card}>
      {/* PDF: lavender tile holding a WHITE rounded icon chip (app previously inverted). */}
      <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderRadius: radii.md }, shadow(1)]}>
        <Icon name={resolved} size={24} tint={colors.primary} />
      </View>
      {/* Single-word names (e.g. "Dermatology") must stay on one line — auto-shrink
          to fit the tile width rather than break mid-word. Fixed label box keeps all
          tiles identical height. */}
      <View style={styles.labelBox}>
        <Text
          variant="caption"
          weight="700"
          align="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={styles.label}
        >
          {name}
        </Text>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", justifyContent: "flex-start" },
  iconWrap: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  labelBox: { height: 18, justifyContent: "center", marginTop: 8, alignSelf: "stretch" },
  label: { lineHeight: 16 },
});
