import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";

import { Icon } from "./Icon";
import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";

/** Back control with a mirrored chevron in RTL. Falls back to a no-op if cannot go back. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  const { colors, isRTL } = useTheme();
  const handle = onPress ?? (() => router.canGoBack() && router.back());
  return (
    <Pressable
      onPress={handle}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      style={styles.btn}
    >
      <Icon name="chevron" direction={isRTL ? "right" : "left"} size={26} tint={colors.text} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center", justifyContent: "center" },
});
