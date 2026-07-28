import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import { QueueUnavailableError } from "@/data/types";
import type { QueueAcknowledgeKind } from "@/data/types";
import { pollInterval, shouldRetryQueue } from "./queuePolling";

export const queueKeys = {
  status: (appointmentId: string) => ["queue", "status", appointmentId] as const,
};

/**
 * Live queue state for one appointment.
 *
 * The single read surface is `GET /api/patients/me/queue-status` via the queue
 * repository. Nothing here computes position, people-ahead or ETA — those are
 * HAMS-owned (docs/QUEUE_BACKEND_FOR_MEDILINK.md §6).
 */
export function useQueueStatus(appointmentId: string | undefined, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!appointmentId;

  return useQuery({
    queryKey: queueKeys.status(appointmentId ?? "none"),
    queryFn: () => repositories.queue.getStatus(appointmentId as string),
    enabled,
    // Queue state is inherently live: never serve it as fresh.
    staleTime: 0,
    refetchInterval: (query) => pollInterval(query.state.data),
    // Poll only in the foreground; backgrounded apps are served by push instead.
    refetchIntervalInBackground: false,
    retry: (count, error) =>
      shouldRetryQueue(count, error instanceof QueueUnavailableError ? error.reason : undefined),
  });
}

/**
 * Subscribe to the patient's own `queue_items` row and refetch on any change.
 *
 * INVALIDATION ONLY — the realtime payload is never read. The row carries no
 * `people_ahead` and no ETA, so the authoritative endpoint is re-called instead
 * (contract §2.3).
 *
 * Lifecycle: subscribes only while the appointment is known, the queue is not in
 * a terminal state, and the app is foregrounded. Re-subscribes and refetches
 * immediately on foreground, because a suspended socket misses every event it
 * would otherwise have delivered.
 */
export function useQueueRealtime(appointmentId: string | undefined, active: boolean) {
  const qc = useQueryClient();
  // Keep the callback identity stable so foregrounding doesn't churn the channel.
  const refetch = useRef(() => {});
  refetch.current = () => {
    if (!appointmentId) return;
    void qc.invalidateQueries({ queryKey: queueKeys.status(appointmentId) });
  };

  useEffect(() => {
    if (!appointmentId || !active) return;

    let unsubscribe: (() => void) | null = null;

    const connect = () => {
      if (unsubscribe) return;
      unsubscribe = repositories.queue.subscribe(appointmentId, () => refetch.current());
    };
    const disconnect = () => {
      unsubscribe?.();
      unsubscribe = null;
    };

    if (AppState.currentState === "active") connect();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        connect();
        // Catch up on everything missed while suspended.
        refetch.current();
      } else {
        disconnect();
      }
    });

    return () => {
      sub.remove();
      disconnect();
    };
  }, [appointmentId, active]);
}

/**
 * Acknowledge a queue call ("I'm on my way" / "I've seen the call").
 *
 * Deliberately NOT optimistic: acknowledgement is a clinical signal reception
 * acts on, so the UI only reflects it once the backend has confirmed the write.
 * On success the status query is invalidated so the acknowledged state comes back
 * from the server rather than being assumed.
 */
export function useAcknowledgeQueueCall(appointmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: QueueAcknowledgeKind) =>
      repositories.queue.acknowledge({ appointmentId: appointmentId as string, kind }),
    onSuccess: () => {
      if (!appointmentId) return;
      void qc.invalidateQueries({ queryKey: queueKeys.status(appointmentId) });
    },
  });
}
