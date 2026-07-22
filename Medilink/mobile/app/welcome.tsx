import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { CtaButton, HeroBackground, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";

/**
 * Welcome (PDF artboard): a tall violet hero card carrying two soft orbs with the
 * heading + subtitle set INSIDE the card (white), the official angled brand CTA
 * ("Create account"), and a filled secondary "I already have an account" button.
 */
export default function WelcomeScreen() {
  const { colors, radii, spacing, isRTL } = useTheme();
  const { t } = useI18n();

  return (
    <Screen scroll padded dismissKeyboardOnTap={false}>
      {/* Violet brand hero (always violet — not theme-primary, which is lavender on dark). */}
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.heroFrom, borderRadius: radii.xl, marginTop: spacing.md, marginBottom: spacing.lg },
        ]}
      >
        <HeroBackground tone="onViolet" radius={radii.xl} />
        <View style={[styles.heroText, { padding: spacing.lg }]}>
          <Text variant="h1" style={{ color: "#FFFFFF" }} align={isRTL ? "right" : "left"}>
            {t("welcome.title")}
          </Text>
          <Text variant="body" align={isRTL ? "right" : "left"} style={{ color: "rgba(255,255,255,0.82)", marginTop: spacing.sm }}>
            {t("welcome.subtitle")}
          </Text>
        </View>
      </View>

      {/* Official angled brand CTA (theme-aware: violet/white light, lavender/violet dark). */}
      <CtaButton label={t("welcome.createAccount")} mirror={isRTL} onPress={() => router.push("/auth/sign-up")} />

      {/* Filled secondary (not a bare text link), per the artboard. */}
      <Pressable
        onPress={() => router.push("/auth/sign-in")}
        accessibilityRole="button"
        accessibilityLabel={t("welcome.haveAccount")}
        style={({ pressed }) => [
          styles.secondary,
          { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, marginTop: spacing.sm, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text variant="title" color="primary" align="center">
          {t("welcome.haveAccount")}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 460,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroText: { width: "100%" },
  secondary: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
});
