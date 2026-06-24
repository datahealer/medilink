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
  /** Small notification dot on the icon sub-tile (PDF dashboard tiles). */
  dot?: boolean;
  onPress?: () => void;
}

/**
 * Me Care Hub tile (PDF dashboard): a white card with the icon inside a lavender
 * rounded-square sub-tile (with a small notification dot), label below in semibold.
 */
export function HubActionTile({ label, brandIcon, icon, dot = false, onPress }: HubActionTileProps) {
  const { colors, radii } = useTheme();
  return (
    <AppCard variant="specialty" onPress={onPress} accessibilityLabel={label} style={styles.card}>
      <View>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent, borderRadius: radii.md }]}>
          {brandIcon ? (
            <BrandIcon name={brandIcon} size={26} color="primary" />
          ) : (
            <Icon name={icon ?? "ai"} size={24} tint={colors.primary} />
          )}
        </View>
        {dot ? <View style={[styles.dot, { backgroundColor: colors.primary, borderColor: colors.surface }]} /> : null}
      </View>
      {/* Fixed 2-line label box + auto-shrink so long words ("Assistant") never
          break mid-word and all four tiles stay identical height. */}
      <View style={styles.labelBox}>
        <Text
          variant="caption"
          weight="600"
          align="center"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={styles.label}
        >
          {label}
        </Text>
        {/* label style starts small so the longest word ("Assistant") fits the
            narrow 4-across tile without an Android mid-word break. */}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", justifyContent: "flex-start" },
  iconWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  labelBox: { height: 30, justifyContent: "center", marginTop: 8, alignSelf: "stretch" },
  label: { fontSize: 11, lineHeight: 14 },
});
