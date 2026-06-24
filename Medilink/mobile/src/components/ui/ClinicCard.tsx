import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { PatternCard } from "./PatternCard";
import { Text } from "./Text";

export interface ClinicCardProps {
  name: string;
  meta?: string; // "Al Khuwair · 24 doctors · 0.8 km"
  tagLabel?: string; // "★ 4.7 · Featured"
  onPress?: () => void;
  isRTL?: boolean;
}

/**
 * Featured clinic banner — a deep-violet orb-pattern card with a light rating/Featured
 * tag and white clinic name + meta, exactly as the brand "Pattern Usage" reference.
 */
export function ClinicCard({ name, meta, tagLabel, onPress, isRTL = false }: ClinicCardProps) {
  const { colors, radii } = useTheme();
  return (
    <PatternCard variant="featuredClinic" surface="primary" pattern="orbs" orbVariant="corner" onPress={onPress} accessibilityLabel={name}>
      <View style={styles.inner}>
        {tagLabel ? (
          <View style={[styles.tag, { backgroundColor: "#FFFFFF", borderRadius: radii.pill, alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <Text variant="caption" style={{ color: colors.heroFrom }}>{tagLabel}</Text>
          </View>
        ) : null}
        <View style={styles.foot}>
          <Text variant="title" numberOfLines={1} style={{ color: "#FFFFFF" }} align={isRTL ? "right" : "left"}>{name}</Text>
          {meta ? <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.80)" }} align={isRTL ? "right" : "left"}>{meta}</Text> : null}
        </View>
      </View>
    </PatternCard>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, justifyContent: "space-between", minHeight: 132 },
  tag: { paddingHorizontal: 10, paddingVertical: 4 },
  foot: { gap: 2 },
});
