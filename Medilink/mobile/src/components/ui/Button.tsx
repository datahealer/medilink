import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "destructive";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Optional leading element (e.g. an icon), placed before the label. */
  leading?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Themed button. All variants meet the 44pt min touch target and expose proper
 * pressed/disabled/loading states + accessibility roles.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  fullWidth = true,
  leading,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors, radii } = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    accent: colors.accent,
    outline: "transparent",
    ghost: "transparent",
    destructive: colors.error,
  };
  const fg: Record<ButtonVariant, keyof typeof colors> = {
    primary: "textOnPrimary",
    accent: "primary",
    outline: "primary",
    ghost: "primary",
    destructive: "textOnPrimary",
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          // Design tokens: buttons use the 14px radius (radii.md); the full pill
          // (radii.pill) is reserved for chips per the brand component sheet.
          borderRadius: radii.md,
          borderWidth: variant === "outline" ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.primary,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "center",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "destructive" ? colors.textOnPrimary : colors.primary} />
      ) : (
        <View style={styles.content}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Text variant="title" color={fg[variant]} align="center">
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_TARGET + 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  leading: { marginEnd: 8 },
});
