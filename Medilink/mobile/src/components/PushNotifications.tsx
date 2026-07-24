import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Headless mount point for the push-notification lifecycle (token sync + received/tap
 * listeners + tap routing). Rendered once inside the provider tree; renders nothing.
 */
export function PushNotifications() {
  usePushNotifications();
  return null;
}
