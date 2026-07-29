import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { supabase } from "@/lib/supabase";

/**
 * Push-notification foundation.
 *
 * Flow: request OS permission → obtain an Expo push token → upsert it into the
 * `device_tokens` table (RLS: own-row only) keyed by (user_id, token). The backend
 * later reads these tokens to dispatch via Expo/FCM/APNs. No UI here.
 */

// Show alerts while the app is foregrounded.
// SDK 54: NotificationBehavior replaced `shouldShowAlert` with the more granular
// `shouldShowBanner` + `shouldShowList` (iOS 14+). Both are set for parity.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens are unavailable on simulators/emulators.
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Populated from app.json → expo.extra.eas.projectId once EAS is configured.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  return token;
}

/** Persist the device's push token for the signed-in user (idempotent upsert). */
export async function saveDeviceToken(token: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const platform: "ios" | "android" | "web" =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

  await supabase
    .from("device_tokens")
    .upsert(
      { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" }
    );
}

/** Convenience: register + persist in one call. Safe to call after sign-in. */
export async function syncPushToken(): Promise<void> {
  const token = await registerForPushNotifications();
  if (token) await saveDeviceToken(token);
}

/**
 * Remove THIS device's push token on sign-out, so the signed-out account (and the next
 * user of this device) stops receiving the previous user's notifications. Must run while
 * the session is still valid (the RLS delete is scoped to `auth.uid() = user_id`).
 * Best-effort: never throws, so it can never block sign-out. Only this device's token is
 * removed — other devices the user is signed in on keep working.
 */
export async function clearPushToken(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const token = await registerForPushNotifications();
    if (!token) return; // can't resolve this device's token (e.g. simulator) — leave others intact
    await supabase.from("device_tokens").delete().eq("user_id", user.id).eq("token", token);
  } catch {
    // Cleanup is best-effort — sign-out must proceed regardless.
  }
}
