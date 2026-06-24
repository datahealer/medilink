import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

/**
 * Official MediLink brand "orb" pattern for violet hero/highlight surfaces
 * (appointment cards, doctor headers, featured clinics, payment cards, success/empty
 * states) — recreated from the brand Pattern/Shapes guidance: soft, low-contrast
 * circular orbs that sit BEHIND content. Token-driven & reusable.
 *
 * NOT the Me submark — the submark is reserved for the FAB, avatars, the "Me Care
 * Hub" badge and empty/loading states (per the brand guidelines).
 *
 * Render it as the first child of a host with `overflow: hidden`; it fills
 * absolutely, is non-interactive, and never carries text/icons.
 */
export type OrbVariant = "large" | "medium" | "corner" | "subtle";

interface Orb {
  cx: string;
  cy: string;
  r: number;
  o: number;
}

// Circles use % positions + px radii so they stay round on any card aspect.
const VARIANTS: Record<OrbVariant, Orb[]> = {
  large: [
    { cx: "88%", cy: "14%", r: 110, o: 0.10 },
    { cx: "72%", cy: "40%", r: 64, o: 0.07 },
    { cx: "6%", cy: "104%", r: 96, o: 0.08 },
  ],
  medium: [
    { cx: "90%", cy: "22%", r: 74, o: 0.09 },
    { cx: "62%", cy: "8%", r: 40, o: 0.06 },
    { cx: "16%", cy: "92%", r: 56, o: 0.06 },
  ],
  corner: [
    { cx: "100%", cy: "100%", r: 120, o: 0.10 },
    { cx: "84%", cy: "78%", r: 60, o: 0.07 },
  ],
  subtle: [
    { cx: "92%", cy: "18%", r: 80, o: 0.05 },
    { cx: "10%", cy: "96%", r: 60, o: 0.04 },
  ],
};

export interface OrbPatternProps {
  variant?: OrbVariant;
  /** Multiplies every orb opacity (keep subtle). */
  intensity?: number;
  /** Orb colour — defaults to white (lightens the violet surface). */
  color?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function OrbPattern({ variant = "large", intensity = 1, color = "#FFFFFF", radius = 0, style }: OrbPatternProps) {
  const orbs = VARIANTS[variant];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }, style]}>
      <Svg width="100%" height="100%">
        {orbs.map((orb, i) => (
          <Circle key={i} cx={orb.cx} cy={orb.cy} r={orb.r} fill={color} opacity={orb.o * intensity} />
        ))}
      </Svg>
    </View>
  );
}
