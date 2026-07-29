import React, { useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { Text } from "./Text";

export interface CtaButtonProps {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Mirror the slant for RTL so the angle leads in the reading direction. */
  mirror?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Brand geometry (MediLink_Design_Documentation.pdf p6 "BRAND CTA · official angled
// shape" + Shapes/CTA BUTTON): rounded left, full-width top edge, the right edge
// slants inward to a shorter bottom — the signature angled tag.
const SLANT = 18; // px the bottom-right is cut in from the top-right
const RADIUS = 16; // left-corner rounding

/**
 * The official MediLink angled brand CTA. NOT a replacement for the standard
 * rounded `Button` — reserved for brand moments (welcome hero, onboarding finish,
 * empty-state primary actions) where the PDF uses the angled shape.
 */
export function CtaButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  mirror = false,
  accessibilityLabel,
  style,
}: CtaButtonProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const isDisabled = disabled || loading;
  // Theme-aware like the standard primary button: violet/white on light,
  // lavender/violet on dark (matches the Welcome artboards in both themes).
  const fill = colors.primary;
  const fg = colors.textOnPrimary;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const { w, h } = size;
  const r = Math.min(RADIUS, h / 2);
  // Path: rounded left, sharp top-right at full width, slanted right edge down to
  // a bottom-right that is SLANT px shorter. Mirrored horizontally for RTL.
  const path = mirror
    ? `M ${SLANT},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L 0,${h} Z`
    : `M ${r},0 L ${w},0 L ${w - SLANT},${h} L ${r},${h} Q 0,${h} 0,${h - r} L 0,${r} Q 0,0 ${r},0 Z`;

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [styles.base, { opacity: isDisabled ? 0.5 : pressed ? 0.9 : 1 }, style]}
    >
      {w > 0 ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={path} fill={fill} />
        </Svg>
      ) : null}
      <View style={[styles.content, { paddingHorizontal: mirror ? 28 : 20, paddingEnd: mirror ? 20 : 28 }]}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <Text variant="title" align="center" style={{ color: fg }}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_TARGET + 6,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  content: {
    minHeight: HIT_TARGET + 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
});
