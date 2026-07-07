import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Soft brand "orb" highlights for the violet brand hero surfaces (Welcome hero,
 * Dashboard featured tile). Two translucent circles — a large one upper-right and a
 * smaller one mid-left — exactly as the approved Welcome artboard. Render as the first
 * child of a host with `overflow: hidden`; it fills absolutely and is non-interactive.
 *
 * Note: the connected-dot brand PATTERN is intentionally NOT rendered on app screens —
 * the PDF artboards (splash/welcome/onboarding) use clean gradients/orbs, not the dot
 * field, so adding it would diverge from the source of truth.
 */
export interface HeroBackgroundProps {
  /** "onViolet" = light orbs over a violet hero. "onSurface" = faint dark orbs. */
  tone?: "onViolet" | "onSurface";
  intensity?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function HeroBackground({ tone = "onViolet", intensity = 1, radius = 0, style }: HeroBackgroundProps) {
  const base = tone === "onViolet" ? "255, 255, 255" : "46, 26, 71";
  const big = `rgba(${base}, ${0.07 * intensity})`;
  const small = `rgba(${base}, ${0.06 * intensity})`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }, style]}>
      <View style={[styles.orb, { width: 220, height: 220, borderRadius: 110, top: -48, right: -36, backgroundColor: big }]} />
      <View style={[styles.orb, { width: 130, height: 130, borderRadius: 65, top: 70, left: -28, backgroundColor: small }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { position: "absolute" },
});
