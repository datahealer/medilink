import React from "react";
import { Image, type StyleProp, type ImageStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";

// Official MediLink "Me" submark — the supplied brand asset (Logo/SUBMARK, white
// variant, trimmed to the glyph). Shipped as a transparent silhouette so it is
// recoloured per-context via tintColor.
const ME_MARK = require("../../../assets/brand/me-mark.png");
const ME_WORDMARK = require("../../../assets/brand/me-wordmark.png");
const ME_WORDMARK_AR = require("../../../assets/brand/me-wordmark-ar.png");

// Aspect ratios (px) from the trimmed official assets.
const MARK_RATIO = 1363 / 926; // width / height (official SUBMARK, trimmed)
const WORD_RATIO = 1200 / 289;
const WORD_RATIO_AR = 1200 / 289;

export interface MeMarkProps {
  /** Rendered height in px (width derives from the brand aspect ratio). */
  height?: number;
  /** Tint colour. Defaults to the theme primary (violet on light, lavender on dark). */
  color?: string;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/** The official MediLink Me submark (not text / not a placeholder). */
export function MeMark({ height = 28, color, style, accessibilityLabel = "MediLink Me" }: MeMarkProps) {
  const { colors } = useTheme();
  return (
    <Image
      source={ME_MARK}
      style={[{ height, width: height * MARK_RATIO, tintColor: color ?? colors.primary }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export interface MeWordmarkProps {
  height?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}

/** The official MediLink wordmark (Agatho EN / Arabic in RTL), tintable per context. */
export function MeWordmark({ height = 22, color, style }: MeWordmarkProps) {
  const { colors, isRTL } = useTheme();
  const ratio = isRTL ? WORD_RATIO_AR : WORD_RATIO;
  return (
    <Image
      source={isRTL ? ME_WORDMARK_AR : ME_WORDMARK}
      style={[{ height, width: height * ratio, tintColor: color ?? colors.primary }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="MediLink"
    />
  );
}
