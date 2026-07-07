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

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.accent },
      ]}
      accessibilityRole="image"
      accessibilityLabel={name ?? undefined}
    >
      <Text variant="title" color="primary" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
});
