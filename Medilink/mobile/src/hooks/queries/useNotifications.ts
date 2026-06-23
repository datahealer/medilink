import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { NotificationPrefs } from "@/data/types";

/** Notifications center, facility messages and preferences (PDF flow 14). */
export const notificationKeys = {
  list: ["notifications", "list"] as const,
  messages: ["notifications", "messages"] as const,
  prefs: ["notifications", "prefs"] as const,
};

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: () => repositories.notification.list(),
  });
}

export function useFacilityMessages() {
  return useQuery({
    queryKey: notificationKeys.messages,
    queryFn: () => repositories.notification.facilityMessages(),
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: notificationKeys.prefs,
    queryFn: () => repositories.notification.getPreferences(),
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => repositories.notification.updatePreferences(patch),
    onSuccess: (data) => qc.setQueryData(notificationKeys.prefs, data),
  });
}
