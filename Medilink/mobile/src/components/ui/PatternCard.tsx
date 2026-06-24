import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { brand } from "@/theme/tokens";
import { AppCard, type AppCardProps } from "./AppCard";
import { MeMark } from "./MeMark";

type PatternMode = "none" | "submark" | "watermark";
type Corner = "topRight" | "bottomRight" | "bottomLeft" | "topLeft";
type Surface = "primary" | "secondary" | "dark";

export interface PatternCardProps extends Omit<AppCardProps, "backgroundColor" | "bordered"> {
  pattern?: PatternMode;
  patternPosition?: Corner;
  patternOpacity?: number;
  patternScale?: number;
  surface?: Surface;
}

const CORNER: Record<Corner, object> = {
  topRight: { top: -10, right: -10 },
  bottomRight: { bottom: -16, right: -12 },
  bottomLeft: { bottom: -16, left: -12 },
  topLeft: { top: -10, left: -10 },
};

/**
 * AppCard + an official MediLink submark watermark sitting BEHIND the content and
 * clipped to the card radius. Uses only the supplied SUBMARK asset (via MeMark);
 * never a redrawn pattern. `surface` picks the fill + the watermark tint so it works
 * on the violet hero ("primary"/"dark") and on light cards ("secondary").
 */
export function PatternCard({
  pattern = "none",
  patternPosition = "bottomRight",
  patternOpacity,
  patternScale = 1,
  surface,
  children,
  ...cardProps
}: PatternCardProps) {
  const { colors } = useTheme();

  const isViolet = surface === "primary" || surface === "dark";
  const bg = surface === "primary" ? colors.heroFrom : surface === "dark" ? colors.surface : undefined;
  const markColor = isViolet ? brand.lavender : colors.primary;
  const opacity = patternOpacity ?? (isViolet ? 0.12 : 0.06);
  const markHeight = 150 * patternScale;

  return (
    <AppCard {...cardProps} backgroundColor={bg} bordered={!isViolet}>
      {pattern !== "none" ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer]}>
          <View style={[styles.mark, CORNER[patternPosition], { opacity }]}>
            <MeMark height={markHeight} color={markColor} />
          </View>
        </View>
      ) : null}
      {children}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  layer: { overflow: "hidden" },
  mark: { position: "absolute" },
});
