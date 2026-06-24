import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import type { Edge } from "react-native-safe-area-context";

import { useResponsive } from "@/hooks/useResponsive";
import { AppHeader } from "./AppHeader";
import { Screen } from "./Screen";

export type HeaderVariant = "back" | "none" | "tabs";

export interface AppScreenProps {
  children: React.ReactNode;
  /** "back" = AppHeader with back; "none" = no header (e.g. hero); "tabs" = tab root, NEVER a back button. */
  headerVariant: HeaderVariant;
  title?: string;
  right?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: React.ReactNode;
  edges?: readonly Edge[];
  /** Constrain + center content on large screens. */
  constrain?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

const TAB_BOTTOM_PAD = 48; // clears the floating tab bar on tab roots

/**
 * Standard screen shell. The back button is NEVER automatic — each screen declares
 * its `headerVariant`, so tab roots (Me Family, Specialties, Dashboard…) cannot get
 * an unwanted back button. Safe areas, scroll and RTL come from the underlying Screen.
 */
export function AppScreen({
  children,
  headerVariant,
  title,
  right,
  scroll = true,
  padded = true,
  footer,
  edges,
  constrain = true,
  contentStyle,
}: AppScreenProps) {
  const { contentMaxWidth } = useResponsive();
  const resolvedEdges: readonly Edge[] =
    edges ?? (headerVariant === "tabs" ? (["top", "left", "right"] as const) : (["top", "left", "right", "bottom"] as const));

  const merged: StyleProp<ViewStyle> = [
    constrain ? { maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" } : null,
    headerVariant === "tabs" ? { paddingBottom: TAB_BOTTOM_PAD } : null,
    contentStyle,
  ];

  return (
    <Screen scroll={scroll} padded={padded} footer={footer} edges={resolvedEdges} contentStyle={merged}>
      {headerVariant === "back" ? <AppHeader title={title ?? ""} showBack right={right} /> : null}
      {children}
    </Screen>
  );
}
