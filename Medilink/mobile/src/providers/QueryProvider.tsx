import React from "react";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

/**
 * Single app-wide TanStack Query client. Exported so non-React code (e.g. the
 * sign-out flow) can clear cached patient data on logout.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Keep fetched data in memory long enough to rehydrate offline (matches the
      // persisted maxAge below). Without this, queries are GC'd after 5 min and the
      // offline cache is thin.
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false, // RN has no window focus
      refetchOnReconnect: true, // re-fetch stale data when connectivity returns
    },
    mutations: { retry: 0 },
  },
});

// 3.1 — drive React Query's online state from real device connectivity (NetInfo). When
// offline, queries don't fire (no error spam); on reconnect, stale queries auto-refetch.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  })
);

// 3.2 — persist the query cache so previously-loaded data (appointments, records,
// profile, …) renders instantly on cold start and while offline.
//
// SECURITY NOTE: AsyncStorage is app-private but NOT encrypted at rest. The cache can
// hold PHI, so it is (a) purged on logout via clearPersistedCache(), (b) capped at a
// 24h maxAge, and (c) version-busted. For stronger at-rest protection, swap the storage
// for an encrypted store (e.g. react-native-mmkv with an encryptionKey) — the persister
// is the only change point. See the Phase 3 report.
const STORAGE_KEY = "medilink-query-cache";
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  throttleTime: 1000,
});

/** Purge the persisted cache — called on logout so no patient data is retained at rest. */
export async function clearPersistedCache(): Promise<void> {
  try {
    await persister.removeClient();
  } catch {
    // Best-effort; logout must never be blocked by cache cleanup.
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        // App-version buster: prevents a stale-shape cache from rehydrating post-update.
        buster: "v0.1.0",
        dehydrateOptions: {
          // Only persist successful reads; never persist errored/pending queries.
          shouldDehydrateQuery: (q) => q.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
