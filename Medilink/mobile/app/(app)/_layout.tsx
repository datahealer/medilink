import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";

/**
 * Auth gate for every authenticated screen. Because this runs for the whole
 * `(app)` group, deep links into /dashboard, /profile, /family, … cannot bypass
 * it. While the session is still restoring we show a neutral loader; an
 * unauthenticated user is redirected to sign-in.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "guest") {
    return <Redirect href="/auth/sign-in" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      {/* The tab navigator (Home/Search/Me/Records/Profile) carries the bottom nav. */}
      <Stack.Screen name="(tabs)" />
      {/* Detail screens push full-screen over the tabs — no bottom nav, matching the PDF. */}
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="medical-history" />
      <Stack.Screen name="family/add" />
      <Stack.Screen name="family/[id]" />
      <Stack.Screen name="patient-switcher" />
      {/* Filters presents as a true bottom sheet — partial-height detents + grabber
          (PDF p18). Falls back to a slide-up modal where formSheet is unsupported. */}
      <Stack.Screen
        name="search/filters"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.65, 0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
        }}
      />
    </Stack>
  );
}
