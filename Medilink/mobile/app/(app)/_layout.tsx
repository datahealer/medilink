import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, useSegments } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { useProfile } from "@/hooks/queries/usePatient";

/**
 * Guest-browsing allow-list (F4). A signed-out guest may reach ONLY these read-only
 * discovery routes; every other `(app)` route (patient tabs, booking, records,
 * profile, family, payments, notifications, settings account, …) redirects to the
 * sign-in wall. Matched against the joined `useSegments()` path.
 */
function isGuestAllowed(segments: string[]): boolean {
  const path = segments.join("/");
  return (
    path.includes("(tabs)/search") || // discovery search tab (guest home)
    path.includes("/doctors") ||       // doctor profile (doctors/[id])
    path.includes("search/specialties") ||
    path.includes("search/map") ||
    path.includes("search/filters") ||
    path.includes("settings/appearance") // appearance/theme (no personal data)
  );
}

/**
 * Auth gate for every authenticated screen. Because this runs for the whole
 * `(app)` group, deep links into /dashboard, /profile, /family, … cannot bypass
 * it. While the session is still restoring we show a neutral loader; a signed-out
 * user is redirected to sign-in — unless they opted into guest browsing, in which
 * case allow-listed discovery routes render and everything else hits the wall (F4).
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const status = useAuthStore((s) => s.status);
  const guestMode = useAuthStore((s) => s.guestMode);
  const segments = useSegments();
  // Only fetch the profile once authed (guests never reach the gated content).
  const profile = useProfile({ enabled: status === "authed" });

  const loader = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );

  if (status === "loading") return loader;

  if (status === "guest") {
    // Guest browsing: render allow-listed discovery; everything else → sign-in wall.
    // (A guest has no session, so the profile-setup gate below never applies.)
    if (guestMode && isGuestAllowed(segments)) {
      // fall through to render the Stack
    } else {
      return <Redirect href="/auth/sign-in" />;
    }
  } else {
    // Mandatory profile setup for first-time patients. A freshly-provisioned
    // patient_profiles row has `date_of_birth === null` (it is written only by the
    // setup screen / profile editor), so DOB-null is a schema-free "not onboarded yet"
    // signal — identical to the web rule (frontend/src/lib/onboarding.ts). Existing
    // users who completed onboarding have a DOB and pass straight through. We never
    // block on a load error (default into the app) and always allow the setup route
    // itself through to avoid a redirect loop.
    const onSetup = segments.includes("setup");
    if (!onSetup) {
      if (profile.isLoading) return loader;
      if (profile.isSuccess && !profile.data?.patient?.date_of_birth) {
        return <Redirect href="/setup" />;
      }
    }
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      {/* The tab navigator (Home/Search/Me/Records/Profile) carries the bottom nav. */}
      <Stack.Screen name="(tabs)" />
      {/* Mandatory first-time profile setup (full-screen, no tabs). */}
      <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
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
