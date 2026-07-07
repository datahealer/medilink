import React from "react";
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { useThemeStore } from "@/stores/themeStore";
import type { ThemeColors } from "@/theme/light";
import { EMIT_FONT_WEIGHT, fontFamilyFor, typeScale, type FontWeight, type TypeVariant } from "@/theme/typography";

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Theme colour role (no hardcoded hex in screens). */
  color?: keyof ThemeColors;
  align?: TextStyle["textAlign"];
  weight?: FontWeight;
}

/**
 * Themed, locale-aware text primitive. Resolves the concrete brand font family from
 * the type scale's (role, weight) and swaps to 29LT Zarid Sans for Arabic/RTL. Use
 * everywhere instead of bare <Text> so colour + typography stay centralised.
 */
export function Text({
  variant = "body",
  color = "text",
  align,
  weight,
  style,
  ...rest
}: TextProps) {
  const { colors, isRTL } = useTheme();
  const textScale = useThemeStore((s) => s.textScale);
  const scale = typeScale[variant];
  const effWeight = (weight ?? scale.fontWeight) as FontWeight;
  const family = fontFamilyFor(scale.family, effWeight, isRTL);

  return (
    <RNText
      style={[
        {
          color: colors[color],
          fontSize: Math.round(scale.fontSize * textScale),
          lineHeight: Math.round(scale.lineHeight * textScale),
          fontFamily: family,
          ...(EMIT_FONT_WEIGHT ? { fontWeight: effWeight } : null),
          textAlign: align ?? (isRTL ? "right" : "left"),
          writingDirection: isRTL ? "rtl" : "ltr",
        },
        style,
      ]}
      {...rest}
    />
  );
}
