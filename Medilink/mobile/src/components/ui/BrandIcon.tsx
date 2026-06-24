import React from "react";
import { Image, type StyleProp, type ImageStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import type { ThemeColors } from "@/theme/light";

/**
 * Official MediLink "Highlights" icon set (Care · Reviews · Book · Tips · Doctors),
 * derived as transparent silhouettes from the supplied `Highlights/JPEG` source
 * (see docs/BRAND_ASSET_AUDIT.md). Tinted per context — never redrawn.
 */
const SOURCES = {
  care: require("../../../assets/brand/highlights/care.png"),
  reviews: require("../../../assets/brand/highlights/reviews.png"),
  book: require("../../../assets/brand/highlights/book.png"),
  tips: require("../../../assets/brand/highlights/tips.png"),
  doctors: require("../../../assets/brand/highlights/doctors.png"),
} as const;

export type BrandIconName = keyof typeof SOURCES;

export interface BrandIconProps {
  name: BrandIconName;
  size?: number;
  color?: keyof ThemeColors;
  tint?: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

export function BrandIcon({ name, size = 24, color = "primary", tint, style, accessibilityLabel }: BrandIconProps) {
  const { colors } = useTheme();
  return (
    <Image
      source={SOURCES[name]}
      style={[{ width: size, height: size, tintColor: tint ?? colors[color] }, style]}
      resizeMode="contain"
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
