import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { brand } from "@/theme/tokens";
import { MeMark, MeWordmark } from "./MeMark";

export interface LogoProps {
  /** "mark" = the official Me submark only; "full" = submark + MediLink wordmark. */
  variant?: "mark" | "full";
  size?: "sm" | "md" | "lg";
  /** Render light-on-dark (e.g. over the violet splash hero). */
  onDark?: boolean;
}

const SIZES = {
  sm: { mark: 26, word: 16 },
  md: { mark: 40, word: 22 },
  lg: { mark: 60, word: 30 },
} as const;

/**
 * MediLink identity built from the OFFICIAL brand assets (Me submark + wordmark),
 * tinted per context. The submark carries the brand on its own per the brand system.
 */
export function Logo({ variant = "full", size = "md", onDark = false }: LogoProps) {
  const { colors } = useTheme();
  const s = SIZES[size];

  const markColor = onDark ? brand.lavender : colors.primary; // lavender-on-violet pairing
  const wordColor = onDark ? brand.white : colors.primary;

  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="MediLink">
      <MeMark height={s.mark} color={markColor} />
      {variant === "full" ? <MeWordmark height={s.word} color={wordColor} style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", justifyContent: "center" },
});
