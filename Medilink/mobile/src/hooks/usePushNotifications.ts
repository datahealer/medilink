import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { syncPushToken } from "@/services/push";
import { useAuthStore } from "@/stores/authStore";
import { routeForNotificationData, type NotificationData } from "@/utils/notifications";

/**
 * Route a tapped notification to its destination from the `data` payload. Guarded so a
 * missing/blank payload is a safe no-op. The (app) auth gate still applies to the
 * target route, so a signed-out tap lands on the sign-in wall rather than leaking data.
 */
function handleNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const data = response.notification.request.content.data as NotificationData | undefined;
  const target = routeForNotificationData(data);
  if (target) router.push(target as never);
}

/**
 * Wires push notifications end-to-end on the client (Phase 2 · 2.1–2.5):
 *  • 2.1/2.2 — after sign-in / session restore, request OS permission + register the
 *    device's Expo push token (persisted to `device_tokens` via services/push).
 *  • 2.3 — the foreground presentation handler is registered on import of services/push.
 *  • 2.4 — a received listener fires while foregrounded (presentation handled by the
 *    handler; this is the hook point for badge/count refresh).
 *  • 2.5 — a response listener routes a tapped notification to the correct screen,
 *    including the cold-start case (app launched by tapping a notification while killed).
 *
 * Actual delivery + APNs/EAS credentials (2.6/2.7) are verified on-device separately.
 */
export function usePushNotifications() {
  const status = useAuthStore((s) => s.status);
  const coldStartHandled = useRef(false);

  // 2.1 / 2.2 — register + persist the push token once the user is authenticated.
  useEffect(() => {
    if (status !== "authed") return;
    void syncPushToken();
  }, [status]);

  // 2.4 / 2.5 — live listeners while mounted.
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      // Foreground presentation is handled by setNotificationHandler (services/push).
      if (__DEV__) console.log("[push] received:", notification.request.content.title);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  // 2.5 (cold start) — app launched by tapping a notification while killed. Wait until
  // auth has resolved (navigator mounted + gate ready), then route exactly once.
  useEffect(() => {
    if (status === "loading" || coldStartHandled.current) return;
    coldStartHandled.current = true;
    void Notifications.getLastNotificationResponseAsync().then(handleNotificationResponse);
  }, [status]);
}
