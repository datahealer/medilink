import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { HeroBackground } from "./HeroBackground";
import { MeMark } from "./MeMark";
import { brand } from "@/theme/tokens";
import { Text } from "./Text";

export interface ClinicCardProps {
  name: string;
  meta?: string; // "Al Khuwair · 24 doctors · 0.8 km"
  tagLabel?: string; // "★ 4.7 · Featured"
  onPress?: () => void;
  isRTL?: boolean;
}

/**
 * Featured clinic card — a tall violet hero (official submark watermark + orbs) with
 * a floating rating/Featured tag, then the clinic name + meta below. Not the compact
 * list-card layout.
 */
export function ClinicCard({ name, meta, tagLabel, onPress, isRTL = false }: ClinicCardProps) {
  const { colors, radii } = useTheme();
  return (
    <AppCard variant="featuredClinic" onPress={onPress} accessibilityLabel={name}>
      <View style={[styles.hero, { backgroundColor: colors.heroFrom }]}>
        <HeroBackground tone="onViolet" />
        <View style={styles.watermark} pointerEvents="none">
          <MeMark height={120} color={brand.lavender} />
        </View>
        {tagLabel ? (
          <View style={[styles.tag, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <Text variant="caption" color="primary">{tagLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.foot}>
        <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{name}</Text>
        {meta ? <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{meta}</Text> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  hero: { height: 104, padding: 10, overflow: "hidden" },
  watermark: { position: "absolute", right: -8, bottom: -18, opacity: 0.18 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  foot: { padding: 12 },
});
