import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

import { MeMark, MeWordmark, Screen, Text } from "@/components/ui";
import { splashMetrics } from "@/utils/splashMetrics";
import { brand } from "@/theme/tokens";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useThemeStore } from "@/stores/themeStore";
import { useLocaleStore } from "@/stores/localeStore";
import { useAuthStore } from "@/stores/authStore";

const MIN_VISIBLE_MS = 1200;

/**
 * Brand-led launch screen (PDF p10 / QA MED-014 reference artboard): a full-bleed violet
 * gradient with the app-icon tile + white "Me" submark, the Medilink wordmark, and the
 * tagline. Waits for persisted prefs + the Supabase session, then routes.
 *
 * ══ WHY THE BACKGROUND IS RENDERED OUTSIDE <Screen> (QA MED-014) ══
 *
 * QA reported a vertical colour band down the right edge. It was two separate layout
 * defects stacking, neither of them a colour choice:
 *
 *  1. THE GRADIENT WAS INSET BY THE PARENT'S PADDING.
 *     The background used to be `<Svg style={StyleSheet.absoluteFill}>` rendered as a
 *     CHILD of <Screen padded>. Screen's inner View carries `paddingHorizontal:
 *     spacing.lg` (24), and in Yoga an absolutely-positioned child is laid out against
 *     its parent's PADDING box — not its border box. So `absoluteFill` stopped 24pt
 *     short on each side, and those two strips showed Screen's flat SafeAreaView
 *     background instead. At the top both are #2E1A47 so it was invisible; further down
 *     the gradient reaches #3B2056 while the strips stay #2E1A47, which is exactly the
 *     band that appeared on screen.
 *
 *  2. THE GRADIENT WAS DIAGONAL AND CLAMPED.
 *     It was `<LinearGradient x1="0" y1="0" x2="0.35" y2="1">` in SVG
 *     objectBoundingBox units, so the gradient vector ended at 35% of the width. With
 *     the default `spreadMethod="pad"`, every point projecting past the end is clamped
 *     to the last stop, and that t=1 iso-line crosses the lower-right of the box —
 *     drawing a hard straight edge with a flat block of colour beyond it. The reference
 *     spec is a plain vertical ramp (top #2E1A47 → bottom #3B2056), so the diagonal was
 *     wrong regardless of the clamping.
 *
 * THE FIX: the gradient is now a sibling of <Screen>, filling an unpadded root View, so
 * it is genuinely full-bleed — under the status bar, under the home indicator, and edge
 * to edge. <Screen> is transparent and only handles safe-area insets for the CONTENT.
 * expo-linear-gradient replaces the SVG so there is no bounding-box or spreadMethod
 * behaviour to reason about: `start`/`end` are literal, and it is a straight vertical ramp.
 *
 * Do not move the gradient back inside <Screen>, and do not give it a non-vertical
 * start/end — either reintroduces MED-014.
 *
 * ══ THEME INDEPENDENCE ══
 *
 * `heroFrom`/`heroTo` are identical in light.ts and dark.ts, so the ground is the same in
 * both themes. The FOREGROUND must therefore be theme-independent too, and it takes its
 * colours from `brand` rather than the theme: `colors.accent` is lavender #DFC8E7 in
 * light but violet #4A3168 in dark, which put the tagline at 1.42:1 on this background
 * (WCAG AA needs 4.5:1 — it was invisible) and made the progress fill darker than its own
 * track. StatusBar is likewise pinned to "light": Screen picks its style from the theme,
 * which produced dark status-bar glyphs on this dark ground in light mode.
 *
 * `MeWordmark` already selects the Arabic asset when `isRTL`, so AR branding is unaffected
 * and the composition is centred rather than direction-dependent.
 */
export default function SplashScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();

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

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  // Proportions taken off the reference artboard, as fractions of the live window — see
  // utils/splashMetrics.ts. Pure and unit-tested, so the "no fixed device width" rule is
  // enforced by a test rather than by reading this file.
  const { tileSize, tileRadius, markHeight, wordmarkHeight, gapAfterTile, gapAfterWordmark } =
    splashMetrics(width);

  return (
    <View style={[styles.root, { backgroundColor: colors.heroFrom }]}>
      {/* FULL-BLEED background. Sibling of <Screen>, so no padding or safe-area inset can
          clip it — this is the MED-014 fix. Straight vertical ramp, matching the spec. */}
      <LinearGradient
        colors={[colors.heroFrom, colors.heroTo]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Always light glyphs: this ground is dark in BOTH themes. Rendered after Screen's
          own StatusBar so it wins. */}
      <StatusBar style="light" />

      <Screen
        center
        padded
        backgroundColor="transparent"
        dismissKeyboardOnTap={false}
        edges={["top", "bottom"]}
      >
        <View style={styles.center}>
          {/* App-icon tile holding the white Me submark. */}
          <View
            style={[
              styles.tile,
              { width: tileSize, height: tileSize, borderRadius: tileRadius },
            ]}
          >
            <MeMark height={markHeight} color="#FFFFFF" />
          </View>

          {/* Pure white, matching the MeMark above it — brand.white is an off-white
              (#F9F4FA) used for surfaces, and swapping it in here would shift the tone. */}
          <MeWordmark
            height={wordmarkHeight}
            color="#FFFFFF"
            style={{ marginTop: gapAfterTile }}
          />

          {/* brand.lavender, NOT colors.accent — see the block comment (QA MED-014). */}
          <Text
            variant="caption"
            align="center"
            style={{ color: brand.lavender, marginTop: gapAfterWordmark }}
          >
            {t("splash.tagline")}
          </Text>
        </View>

        <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
          <Animated.View style={[styles.fill, { width: barWidth, backgroundColor: brand.lavender }]} />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tile: {
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  track: { height: 4, width: "58%", borderRadius: 999, overflow: "hidden", marginBottom: 28 },
  fill: { height: 4, borderRadius: 999 },
});
