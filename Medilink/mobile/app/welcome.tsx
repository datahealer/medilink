import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { CtaButton, HeroBackground, Logo, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";

/**
 * Welcome (PDF p10): brand hero + promise, primary "Create account" CTA and a plain
 * "I already have an account" text link. No top-bar controls (language/theme live in
 * Settings) — matching the design.
 */
export default function WelcomeScreen() {
  const { colors, radii, spacing, isRTL } = useTheme();
  const { t } = useI18n();

  return (
    <Screen scroll padded dismissKeyboardOnTap={false}>
      {/* Brand hero — patterned violet field with the official connected-dot motif. */}
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.primary, borderRadius: radii.xl, marginTop: spacing.lg, marginBottom: spacing.xl },
        ]}
      >
        <HeroBackground tone="onViolet" radius={radii.xl} />
        <Logo variant="full" size="lg" onDark />
      </View>

      <Text variant="h1" align="center">
        {t("welcome.title")}
      </Text>
      <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
        {t("welcome.subtitle")}
      </Text>

      <View style={{ height: spacing.xl }} />

      {/* Official angled brand CTA for this hero moment (PDF "BRAND CTA"). */}
      <CtaButton label={t("welcome.createAccount")} mirror={isRTL} onPress={() => router.push("/auth/sign-up")} />

      <Pressable
        onPress={() => router.push("/auth/sign-in")}
        accessibilityRole="link"
        hitSlop={8}
        style={{ marginTop: spacing.lg, alignItems: "center" }}
      >
        <Text variant="label" color="primary" align="center">
          {t("welcome.haveAccount")}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
