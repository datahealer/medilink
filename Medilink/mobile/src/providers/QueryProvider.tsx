import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Single app-wide TanStack Query client. Exported so non-React code (e.g. the
 * sign-out flow) can clear cached patient data on logout.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // RN has no window focus; refetch when the app/screen remounts instead.
    },
    mutations: {
      retry: 0,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
