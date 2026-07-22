import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { router } from "expo-router";

import { MeMark, MeWordmark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useThemeStore } from "@/stores/themeStore";
import { useLocaleStore } from "@/stores/localeStore";
import { useAuthStore } from "@/stores/authStore";

const MIN_VISIBLE_MS = 1200;

/**
 * Brand-led launch screen (PDF p10): a violet gradient field with the app-icon
 * tile + white "Me" submark, the Medilink wordmark, tagline, and a lavender
 * progress bar. Waits for persisted prefs + the Supabase session, then routes.
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
    <Screen center padded backgroundColor={colors.heroFrom} dismissKeyboardOnTap={false} edges={["top", "bottom"]}>
      {/* Violet brand gradient (sampled from the splash artboard). */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="splash" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={colors.heroFrom} />
            <Stop offset="1" stopColor={colors.heroTo} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#splash)" />
      </Svg>

      <View style={styles.center}>
        {/* App-icon tile holding the white Me submark. */}
        <View style={styles.tile}>
          <MeMark height={54} color="#FFFFFF" />
        </View>
        <MeWordmark height={30} color="#FFFFFF" style={{ marginTop: 22 }} />
        <Text variant="caption" align="center" style={{ color: colors.accent, marginTop: 10 }}>
          {t("splash.tagline")}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
        <Animated.View style={[styles.fill, { width, backgroundColor: colors.accent }]} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tile: {
    width: 104,
    height: 104,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  track: { height: 4, width: "58%", borderRadius: 999, overflow: "hidden", marginBottom: 28 },
  fill: { height: 4, borderRadius: 999 },
});
