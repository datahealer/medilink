import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

export interface AvatarProps {
  name?: string | null;
  uri?: string | null;
  size?: number;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Initials/photo avatar circle (the "Me" placeholder when no photo exists). */
export function Avatar({ name, uri, size = 56 }: AvatarProps) {
  const { colors } = useTheme();
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.accent }}
        accessibilityRole="image"
        accessibilityLabel={name ?? undefined}
      />
    );
  }

  // Initials scale with the circle, so lineHeight MUST be derived here too.
  //
  // `Text` computes lineHeight from its variant — `title` is {fontSize:16, lineHeight:22}.
  // Overriding only fontSize left every avatar wider than 61px drawing ~32px glyphs into a
  // 22px line box, which clipped the initials (QA MED-008: Edit Profile at 88, Profile at
  // 76). 1.2x is the smallest multiplier that clears ascenders and descenders in both
  // Manrope (Latin) and 29LT Zarid Sans (Arabic).
  const fontSize = Math.round(size * 0.36);
  const lineHeight = Math.round(fontSize * 1.2);

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.accent },
      ]}
      accessibilityRole="image"
      accessibilityLabel={name ?? undefined}
    >
      <Text
        variant="title"
        color="primary"
        // One line, always: a wrapped initial would be centred as a block and sit visibly
        // off-axis rather than simply overflowing.
        numberOfLines={1}
        // ── Why font scaling is disabled HERE specifically ──
        // The circle is a FIXED decorative size set by each caller. At a 200% system font
        // scale the glyphs would burst it, and nothing is gained: the initials are a
        // redundant visual stand-in for a name that is always rendered next to the avatar,
        // and the real accessible content is `accessibilityLabel={name}` on the View above,
        // which a screen reader announces in full and which scaling does not affect.
        // This is scoped to the avatar glyph only — no other text in the app opts out.
        allowFontScaling={false}
        style={{
          fontSize,
          lineHeight,
          // Override Text's locale default (right in RTL); initials are centred in a circle.
          textAlign: "center",
          // Android-only. `includeFontPadding` adds asymmetric ascent/descent padding that
          // pushes the glyph off-centre in a tight box; `textAlignVertical` then centres
          // what remains. Both are no-ops on iOS.
          includeFontPadding: false,
          textAlignVertical: "center",
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
});
