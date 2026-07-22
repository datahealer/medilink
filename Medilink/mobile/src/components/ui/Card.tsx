import React from "react";
import {
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { shadow } from "@/utils/platform";

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  /** Visual elevation (platform-safe). 0 = flat bordered surface. */
  elevation?: 0 | 1 | 2;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Themed surface card — the base container for dashboard/profile/family tiles. */
export function Card({
  children,
  onPress,
  elevation = 1,
  padded = true,
  style,
  accessibilityLabel,
}: CardProps) {
  const { colors, radii, spacing } = useTheme();

  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1, // solid 1px — hairline*2 (~0.6px on 3x) was near-invisible
    borderColor: colors.border,
    padding: padded ? spacing.md : 0,
    ...(elevation > 0 ? shadow(elevation as 1 | 2) : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
