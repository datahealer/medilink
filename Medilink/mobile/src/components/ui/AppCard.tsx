import React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { shadow } from "@/utils/platform";

export type AppCardVariant =
  | "doctorList"
  | "featuredClinic"
  | "recentDoctor"
  | "familyMember"
  | "specialty"
  | "appointment"
  | "detail";

/** Per-variant geometry — sized up to the PDF proportions (not list-compressed). */
const SPEC: Record<AppCardVariant, { padding: number; minHeight: number; radius: "md" | "lg" | "xl"; elevation: 0 | 1 | 2 }> = {
  doctorList: { padding: 14, minHeight: 104, radius: "lg", elevation: 1 },
  recentDoctor: { padding: 12, minHeight: 72, radius: "lg", elevation: 1 },
  featuredClinic: { padding: 0, minHeight: 152, radius: "lg", elevation: 1 },
  familyMember: { padding: 14, minHeight: 76, radius: "lg", elevation: 1 },
  specialty: { padding: 14, minHeight: 104, radius: "md", elevation: 1 },
  appointment: { padding: 16, minHeight: 168, radius: "lg", elevation: 2 },
  detail: { padding: 16, minHeight: 0, radius: "lg", elevation: 1 },
};

export interface AppCardProps {
  variant?: AppCardVariant;
  children: React.ReactNode;
  onPress?: () => void;
  /** Override the surface fill (e.g. violet hero for appointment). */
  backgroundColor?: string;
  /** Hide the border (e.g. on filled violet cards). */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Shared surface card. One source of truth for radius / border / shadow / padding /
 * min-height per card type, themed for light & dark. `overflow: hidden` so a
 * PatternCard watermark clips to the radius.
 */
export function AppCard({
  variant = "detail",
  children,
  onPress,
  backgroundColor,
  bordered = true,
  style,
  accessibilityLabel,
}: AppCardProps) {
  const { colors, radii } = useTheme();
  const s = SPEC[variant];
  const base: ViewStyle = {
    backgroundColor: backgroundColor ?? colors.surface,
    borderRadius: radii[s.radius],
    borderWidth: bordered ? 1 : 0,
    borderColor: colors.border,
    padding: s.padding,
    minHeight: s.minHeight,
    overflow: "hidden",
    ...(s.elevation > 0 ? shadow(s.elevation as 1 | 2) : {}),
  };

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [base, { opacity: pressed ? 0.92 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]} accessibilityLabel={accessibilityLabel}>{children}</View>;
}
