import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { AppCard } from "./AppCard";
import { Text } from "./Text";

export interface ClinicCardProps {
  name: string;
  meta?: string; // "Al Khuwair · 24 doctors · 0.8 km"
  tagLabel?: string; // "★ 4.7 · Featured"
  onPress?: () => void;
  isRTL?: boolean;
}

/**
 * Featured clinic card (PDF dashboard). ONE rounded, overflow-hidden parent (AppCard)
 * owns radius / border / shadow / surface. A single absolutely-positioned Svg paints
 * the decorative gradient AND the orbs together, so they are clipped only by the card
 * radius — no inner rectangular wrapper, no horizontal seam, no dark overlay rectangle.
 * The gradient fades into the card surface toward the bottom so the name/meta sit on a
 * clean, readable content area. Content renders above the decorative layer.
 */
export function ClinicCard({ name, meta, tagLabel, onPress, isRTL = false }: ClinicCardProps) {
  const { colors, scheme } = useTheme();
  const isDark = scheme === "dark";
  const cTop = isDark ? "#3A2056" : "#D9C9EC"; // soft lavender/pink
  const cMid = isDark ? "#4A2F70" : "#CADEF2"; // soft blue
  const cBot = colors.surface; // fades into the clean content area (white / dark surface)

  return (
    <AppCard variant="featuredClinic" onPress={onPress} accessibilityLabel={name}>
      {/* Single decorative layer: gradient + orbs in one Svg, clipped by the card radius */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="clinicGrad" x1="0" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={cTop} />
            <Stop offset="0.42" stopColor={cMid} />
            <Stop offset="0.72" stopColor={cBot} />
            <Stop offset="1" stopColor={cBot} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#clinicGrad)" />
        <Circle cx="90%" cy="20%" r="50" fill="#FFFFFF" opacity={isDark ? 0.06 : 0.30} />
        <Circle cx="74%" cy="4%" r="28" fill="#FFFFFF" opacity={isDark ? 0.05 : 0.22} />
      </Svg>

      {/* Content above the decorative layer */}
      <View style={styles.content}>
        {tagLabel ? (
          <View style={[styles.tag, { alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <Text variant="caption" weight="700" style={styles.tagText}>{tagLabel}</Text>
          </View>
        ) : null}
        <View style={styles.foot}>
          <Text variant="title" numberOfLines={1} color="text" align={isRTL ? "right" : "left"}>{name}</Text>
          {meta ? <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{meta}</Text> : null}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 156, padding: 14, justifyContent: "space-between" },
  tag: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tagText: { color: "#2E1A47" }, // crisp dark violet on the white pill, both themes
  foot: { gap: 2 },
});
