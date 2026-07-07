import React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";

import { ThemeProvider } from "@/theme/ThemeProvider";
import { I18nProvider } from "@/i18n";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { BRAND_FONT_FILES } from "@/theme/typography";

/**
 * Root layout: provider tree + navigation Stack.
 *
 * Provider order matters: QueryProvider (server cache) → AuthProvider (bootstraps
 * the Supabase session into authStore). The `(app)` group is auth-gated by its own
 * layout; public routes (splash/welcome/onboarding/language/auth) stay open.
 * Headers are off globally — each screen renders its own header for RTL control.
 */
export default function RootLayout() {
  // Load the official brand fonts before rendering so type is correct from frame 1
  // (no system-font flash). Files are registered in assets/fonts via BRAND_FONT_FILES.
  const [fontsLoaded, fontError] = useFonts(BRAND_FONT_FILES);
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: "#2E1A47" }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <ThemeProvider>
            <I18nProvider>
              <AuthProvider>
                <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="splash" />
                  <Stack.Screen name="welcome" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="language" />
                  <Stack.Screen name="auth" />
                  <Stack.Screen name="(app)" />
                  {/* Dev-only Screen Gallery (gated inside the route by isDev). */}
                  <Stack.Screen name="dev/screen-gallery" />
                </Stack>
              </AuthProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
