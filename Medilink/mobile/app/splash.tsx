import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { HeroBackground, Logo, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useThemeStore } from "@/stores/themeStore";
import { useLocaleStore } from "@/stores/localeStore";
import { useAuthStore } from "@/stores/authStore";

const MIN_VISIBLE_MS = 1200;

/**
 * Brand-led launch screen. Waits for persisted prefs + the Supabase session to
 * restore, then routes:
 *   • authenticated            → Dashboard (the (app) group)
 *   • onboarding not completed  → Welcome
 *   • onboarding completed      → Sign In
 */
export default function SplashScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();

  const onboardingHydrated = useOnboardingStore((s) => s.hasHydrated);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const themeHydrated = useThemeStore((s) => s.hasHydrated);
  const localeHydrated = useLocaleStore((s) => s.hasHydrated);
  const authStatus = useAuthStore((s) => s.status);

  const progress = useRef(new Animated.Value(0)).current;
  const ready =
    onboardingHydrated && themeHydrated && localeHydrated && authStatus !== "loading";

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: MIN_VISIBLE_MS,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (authStatus === "authed") {
        router.replace("/dashboard");
      } else {
        router.replace(onboardingCompleted ? "/auth/sign-in" : "/welcome");
      }
    }, MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [ready, onboardingCompleted, authStatus]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Screen center padded backgroundColor={colors.primary} dismissKeyboardOnTap={false} edges={["top", "bottom"]}>
      <HeroBackground tone="onViolet" />
      <View style={styles.center}>
        <Logo variant="full" size="lg" onDark />
        <Text variant="caption" align="center" style={{ color: colors.accent, marginTop: 12 }}>
          {t("splash.tagline")}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.primaryMuted }]}>
        <Animated.View style={[styles.fill, { width, backgroundColor: colors.accent }]} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  track: { height: 4, width: "60%", borderRadius: 999, overflow: "hidden", marginBottom: 24 },
  fill: { height: 4, borderRadius: 999 },
});
