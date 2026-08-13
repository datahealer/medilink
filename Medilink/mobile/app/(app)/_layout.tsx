import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, useSegments } from "expo-router";

import { GuestWall } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { useProfile } from "@/hooks/queries/usePatient";
import { useAccountStatus } from "@/hooks/queries/useAuth";

/**
 * Guest-browsing allow-list (F4). A signed-out guest may reach ONLY these read-only
 * discovery routes; every other `(app)` route (patient-only tabs, booking, records,
 * profile, family, payments, notifications, settings account, …) shows the in-place
 * sign-in wall (`<GuestWall/>`). Matched against the joined `useSegments()` path.
 *
 * Public discovery surface: the Dashboard (guest home — public sections only), the
 * Search tab and its specialties/map/filters, doctor profiles, and the appearance
 * screen (no personal data). Protected ACTIONS that live on these allowed screens
 * (Book, favourite, notifications, …) are gated per-action via `useGuestGate`.
 */
function isGuestAllowed(segments: string[]): boolean {
  const path = segments.join("/");
  return (
    path.includes("(tabs)/dashboard") || // discovery dashboard (guest home)
    path.includes("(tabs)/search") ||    // discovery search tab
    path.includes("(tabs)/me") ||        // guest hub: sign-in prompt + account-free preferences
    path.includes("/doctors") ||          // doctor profile (doctors/[id])
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
  // Account lifecycle status (MED-016). Reads `profiles` only — the one table a
  // deletion_pending user can still read — so it resolves even while every PHI table is
  // being denied to them.
  const accountStatus = useAccountStatus({ enabled: status === "authed" });

  const loader = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );

  if (status === "loading") return loader;

  if (status === "guest") {
    // A signed-out user who never opted into guest browsing (e.g. a deep link) is sent
    // to sign-in. A guest browsing a protected route sees the in-place sign-in wall,
    // which keeps the navigation stack intact so Back still works (F4 + back-nav fix).
    // (A guest has no session, so the profile-setup gate below never applies.)
    if (!guestMode) return <Redirect href="/auth/sign-in" />;
    if (!isGuestAllowed(segments)) return <GuestWall />;
    // Allowed discovery route → fall through to render the Stack.
  } else {
    // ── Deletion grace window (QA MED-016 / NEW-001) ──────────────────────────
    // An account that requested deletion may reach ONLY the restore screen. This check
    // must come BEFORE the profile-setup gate below, because RLS now denies
    // `patient_profiles` to a deletion_pending user (migration 20260811020000): their
    // profile reads back with `patient: null`, which the DOB-null rule would misread as
    // "never onboarded" and bounce them to /setup instead of the restore screen.
    //
    // This is routing, not security. The security boundary is the restrictive RLS policy,
    // which denies PHI even to a valid token with the app entirely bypassed. If this check
    // were removed the app would still leak nothing — it would just show empty screens
    // instead of an explanation and a way back.
    if (accountStatus.data === "deletion_pending") {
      return <Redirect href="/restore-account" />;
    }
    // Only block on the status query while it is genuinely unresolved. A failed read
    // resolves to null and falls through: failing open here shows the normal app, whose
    // data RLS is already denying, whereas failing closed would strand a healthy user on a
    // restore screen because of one flaky request.
    if (accountStatus.isLoading) return loader;

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
      {/* Payment confirmation is terminal — disable swipe-back so the booking/payment
          flow can never be reached again after a payment attempt (hardware-back and the
          primary action route to the Dashboard). */}
      <Stack.Screen name="booking/payment-success" options={{ gestureEnabled: false }} />
      {/* Detail screens push full-screen over the tabs — no bottom nav, matching the PDF. */}
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="medical-history" />
      <Stack.Screen name="family/index" />
      <Stack.Screen name="family/add" />
      <Stack.Screen name="family/[id]" />
      <Stack.Screen name="patient-switcher" />
      <Stack.Screen name="settings/phone" />
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
