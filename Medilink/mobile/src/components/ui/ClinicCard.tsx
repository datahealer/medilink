import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { OrbPattern } from "./OrbPattern";
import { Text } from "./Text";

export interface ClinicCardProps {
  name: string;
  meta?: string; // "Al Khuwair · 24 doctors · 0.8 km"
  tagLabel?: string; // "★ 4.7 · Featured"
  onPress?: () => void;
  isRTL?: boolean;
}

/**
 * Featured clinic card (PDF dashboard): a soft lavender→pink gradient top band with a
 * subtle orb pattern and a white "★ rating · Featured" pill, over a clean surface band
 * carrying the clinic name (dark, one line) and its meta. Not a solid-violet card —
 * the name/meta sit on the card surface in theme text colour so they're never cropped.
 */
export function ClinicCard({ name, meta, tagLabel, onPress, isRTL = false }: ClinicCardProps) {
  const { colors, radii, scheme } = useTheme();
  const g1 = scheme === "dark" ? colors.heroFrom : "#C7D7EF";
  const g2 = scheme === "dark" ? "#6E4AA0" : "#ECD6EE";

  return (
    <AppCard variant="featuredClinic" onPress={onPress} accessibilityLabel={name}>
      {/* Gradient + orb top band with the rating/Featured pill */}
      <View style={styles.top}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="clinicGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={g1} />
              <Stop offset="1" stopColor={g2} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#clinicGrad)" />
        </Svg>
        <OrbPattern variant="corner" color="#FFFFFF" intensity={0.8} />
        {tagLabel ? (
          <View style={[styles.tag, { backgroundColor: "#FFFFFF", borderRadius: radii.pill, alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <Text variant="caption" weight="600" style={{ color: colors.primary }}>{tagLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* Name + meta band */}
      <View style={[styles.foot, { backgroundColor: colors.surface }]}>
        <Text variant="title" numberOfLines={1} color="text" align={isRTL ? "right" : "left"}>{name}</Text>
        {meta ? <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{meta}</Text> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  top: { height: 112, padding: 12, overflow: "hidden" },
  tag: { paddingHorizontal: 10, paddingVertical: 4 },
  foot: { flex: 1, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
});
