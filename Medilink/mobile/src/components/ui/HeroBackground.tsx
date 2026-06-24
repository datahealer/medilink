import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, G } from "react-native-svg";

import { brand } from "@/theme/tokens";

export interface HeroBackgroundProps {
  /** "onViolet" = light marks over the violet hero (splash/welcome). "onSurface" =
   * very subtle violet marks over a light surface (onboarding/empty states). */
  tone?: "onViolet" | "onSurface";
  /** Dot/orb opacity multiplier (kept subtle by default). */
  intensity?: number;
  /** Rounded corners to match the host card. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// The brand "connected-dot / molecule" motif (Pattern.pdf, Shapes.pdf): paired
// dots joined by short links, scattered at low opacity. Coordinates are in a
// 0..100 × 0..100 field, stretched to fill the host via preserveAspectRatio none.
const DOTS: { x: number; y: number; r: number }[] = [
  { x: 16, y: 18, r: 3.2 },
  { x: 30, y: 24, r: 2 },
  { x: 78, y: 14, r: 3 },
  { x: 88, y: 22, r: 1.8 },
  { x: 12, y: 70, r: 2.4 },
  { x: 24, y: 78, r: 3.4 },
  { x: 70, y: 74, r: 2 },
  { x: 84, y: 82, r: 3 },
  { x: 52, y: 50, r: 1.6 },
];
const LINKS: { a: number; b: number }[] = [
  { a: 0, b: 1 },
  { a: 2, b: 3 },
  { a: 4, b: 5 },
  { a: 6, b: 7 },
];

/**
 * Subtle brand hero treatment — gradient orbs + the connected-dot pattern — for
 * approved brand surfaces only (splash, welcome, onboarding, empty states). Render
 * it as the first child of a host with `overflow: hidden`; it fills absolutely.
 */
export function HeroBackground({ tone = "onViolet", intensity = 1, radius = 0, style }: HeroBackgroundProps) {
  const mark = tone === "onViolet" ? brand.lavender : brand.violet;
  const orb = tone === "onViolet" ? brand.lavender : brand.blue;
  const dotOpacity = (tone === "onViolet" ? 0.16 : 0.07) * intensity;
  const linkOpacity = dotOpacity * 0.7;
  const orbOpacity = (tone === "onViolet" ? 0.18 : 0.12) * intensity;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }, style]}>
      {/* Gradient orbs */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbA" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={orb} stopOpacity={orbOpacity} />
            <Stop offset="100%" stopColor={orb} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="orbB" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={orb} stopOpacity={orbOpacity * 0.8} />
            <Stop offset="100%" stopColor={orb} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="86%" cy="12%" r="90" fill="url(#orbA)" />
        <Circle cx="8%" cy="88%" r="120" fill="url(#orbB)" />
      </Svg>

      {/* Connected-dot pattern (stretched field) */}
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <G>
          {LINKS.map((l, i) => {
            const a = DOTS[l.a]!;
            const b = DOTS[l.b]!;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <Rect
                key={`l${i}`}
                x={Math.min(a.x, b.x)}
                y={my - 0.9}
                width={Math.abs(b.x - a.x)}
                height={1.8}
                rx={0.9}
                fill={mark}
                opacity={linkOpacity}
                origin={`${mx}, ${my}`}
                rotation={(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI}
              />
            );
          })}
          {DOTS.map((d, i) => (
            <Circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={mark} opacity={dotOpacity} />
          ))}
        </G>
      </Svg>
    </View>
  );
}
