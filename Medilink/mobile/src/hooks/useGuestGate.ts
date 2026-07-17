import { useCallback } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";

import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/authStore";

/**
 * F4 Guest Mode — per-action sign-in wall for deny-listed actions that live on an
 * allow-listed screen (e.g. Book / favourite on the doctor profile). Route-level
 * denial is handled by the `(app)` gate; this covers actions the guest can SEE but
 * not perform.
 *
 * `requireAuth(action)` runs `action` immediately for an authenticated user; for a
 * guest it shows a friendly "create an account / sign in" prompt and returns false
 * without running the action.
 */
export function useGuestGate() {
  const status = useAuthStore((s) => s.status);
  const guestMode = useAuthStore((s) => s.guestMode);
  const { t } = useI18n();
  const isGuest = status === "guest" && guestMode;

  const requireAuth = useCallback(
    (action?: () => void): boolean => {
      if (!isGuest) {
        action?.();
        return true;
      }
      Alert.alert(t("guest.wallTitle"), t("guest.wallBody"), [
        { text: t("guest.wallCancel"), style: "cancel" },
        { text: t("guest.signInCta"), onPress: () => router.push("/auth/sign-in") },
      ]);
      return false;
    },
    [isGuest, t]
  );

  return { isGuest, requireAuth };
}
