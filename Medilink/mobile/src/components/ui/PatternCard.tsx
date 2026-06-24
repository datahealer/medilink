import React from "react";

import { useTheme } from "@/hooks/useTheme";
import { AppCard, type AppCardProps } from "./AppCard";
import { OrbPattern, type OrbVariant } from "./OrbPattern";

type Surface = "primary" | "secondary" | "dark";

export interface PatternCardProps extends Omit<AppCardProps, "backgroundColor" | "bordered"> {
  /** "orbs" = official soft orb pattern on a violet hero; "none" = clean surface. */
  pattern?: "none" | "orbs";
  orbVariant?: OrbVariant;
  orbIntensity?: number;
  /** "primary" = violet hero (white text), "dark" = raised surface card, "secondary" = light surface. */
  surface?: Surface;
}

/**
 * AppCard + the official orb pattern behind content, clipped to the card radius.
 * Used only on the violet hero/highlight surfaces the PDF shows with the pattern
 * (appointment, doctor header, featured clinic, payment, success/empty). The Me
 * submark is NEVER used as a card watermark here.
 */
export function PatternCard({
  pattern = "orbs",
  orbVariant = "large",
  orbIntensity = 1,
  surface = "primary",
  children,
  ...cardProps
}: PatternCardProps) {
  const { colors, radii } = useTheme();
  const isViolet = surface === "primary";
  const bg = surface === "primary" ? colors.heroFrom : surface === "dark" ? colors.surface : undefined;
  const r = cardProps.variant === "specialty" ? radii.md : radii.lg;

  return (
    <AppCard {...cardProps} backgroundColor={bg} bordered={!isViolet}>
      {pattern === "orbs" && isViolet ? (
        <OrbPattern variant={orbVariant} intensity={orbIntensity} radius={r} />
      ) : null}
      {children}
    </AppCard>
  );
}
