import React from "react";
import type { TextStyle, StyleProp } from "react-native";

import { Text } from "./Text";
import type { ThemeColors } from "@/theme/light";
import type { TypeVariant, FontWeight } from "@/theme/typography";

/**
 * Semantic typography wrapper over the token-driven `Text` primitive. Screens use
 * these names instead of arbitrary inline sizes/weights, so weight + family stay
 * consistent (e.g. specialty names and card titles are always semibold/bold).
 */
export type AppTextRole =
  | "screenTitle"
  | "sectionTitle"
  | "cardTitle"
  | "body"
  | "caption"
  | "button"
  | "chip"
  | "inputLabel";

const MAP: Record<AppTextRole, { variant: TypeVariant; weight?: FontWeight; uppercase?: boolean; letterSpacing?: number }> = {
  screenTitle: { variant: "h1" }, // Agatho 28
  sectionTitle: { variant: "label", weight: "700", uppercase: false }, // Manrope bold section label
  cardTitle: { variant: "title" }, // Manrope 800 — doctor/clinic/specialty names
  body: { variant: "body" },
  caption: { variant: "caption" },
  button: { variant: "title" },
  chip: { variant: "label", weight: "600" },
  inputLabel: { variant: "label", weight: "600", uppercase: true, letterSpacing: 0.5 },
};

export interface AppTextProps {
  role?: AppTextRole;
  color?: keyof ThemeColors;
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export function AppText({ role = "body", color, align, numberOfLines, style, children }: AppTextProps) {
  const m = MAP[role];
  const content = m.uppercase && typeof children === "string" ? children.toUpperCase() : children;
  return (
    <Text
      variant={m.variant}
      weight={m.weight}
      color={color}
      align={align}
      numberOfLines={numberOfLines}
      style={[m.letterSpacing ? { letterSpacing: m.letterSpacing } : null, style]}
    >
      {content}
    </Text>
  );
}
