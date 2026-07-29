import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AppCard } from "./AppCard";
import { Text } from "./Text";

export interface ClinicCardProps {
  name: string;
  meta?: string; // "Multi-speciality · 24 doctors · 0.8 km"
  tagLabel?: string; // "★ 4.7 · Featured"
  onPress?: () => void;
  isRTL?: boolean;
}

/**
 * Featured clinic card (reference design). One overflow-hidden parent card with:
 *  - a clean, full-width gradient banner — Smooth Pastel Blue #C3D7EE → Shocking Lavender
 *    #DFC8E7, horizontal — IDENTICAL in light and dark mode (no pattern, no orbs), carrying
 *    the white "★ rating · Featured" pill top-left, and
 *  - a details area on the card surface (white in light, Russian-violet dark surface) with
 *    the clinic name + meta.
 *
 * The banner is an expo-linear-gradient View, so it reliably fills 100% of the card width
 * (no SVG percentage quirks, no right-side strip) and is clipped to the card's top radius.
 */
export function ClinicCard({ name, meta, tagLabel, onPress, isRTL = false }: ClinicCardProps) {
  return (
    <AppCard variant="featuredClinic" onPress={onPress} accessibilityLabel={name}>
      <LinearGradient
        colors={["#C3D7EE", "#DFC8E7"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.band}
      >
        {tagLabel ? (
          <View style={[styles.tag, { alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
            <Text variant="caption" weight="700" style={styles.tagText}>{tagLabel}</Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.details}>
        <Text variant="title" numberOfLines={1} color="text" align={isRTL ? "right" : "left"}>{name}</Text>
        {meta ? <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{meta}</Text> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  band: { width: "100%", alignSelf: "stretch", height: 84, padding: 12 },
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
  tagText: { color: "#2E1A47" }, // Russian Violet — crisp on the pastel banner, both themes
  details: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center", gap: 3 },
});
