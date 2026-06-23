import React from "react";
import { Image, type StyleProp, type ImageStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";

// Official MediLink "Me" submark — rasterised from the approved brand vector
// (assets/brand/me-mark.png, the M+e ligature). Shipped as a transparent
// silhouette so it is recoloured per-context via tintColor.
const ME_MARK = require("../../../assets/brand/me-mark.png");
const ME_WORDMARK = require("../../../assets/brand/me-wordmark.png");

// Source aspect ratios (px) from the rasteriser.
const MARK_RATIO = 660 / 457; // width / height
const WORD_RATIO = 1200 / 289;

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

/** The official MediLink wordmark (Agatho), tintable per context. */
export function MeWordmark({ height = 22, color, style }: MeWordmarkProps) {
  const { colors } = useTheme();
  return (
    <Image
      source={ME_WORDMARK}
      style={[{ height, width: height * WORD_RATIO, tintColor: color ?? colors.primary }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="MediLink"
    />
  );
}
