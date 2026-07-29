import { useCallback, useRef, useState } from "react";

/**
 * Pull-to-refresh helper for React Query screens. Pass a function that triggers the
 * screen's refetch(es) (e.g. `() => Promise.all([a.refetch(), b.refetch()])`); it
 * returns a stable `onRefresh` plus a single `refreshing` flag to drive a
 * <RefreshControl/>. The latest refetch closure is always used (via a ref), so
 * `onRefresh` never goes stale even though its identity is stable.
 */
export function useRefresh(refetch: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve(refetchRef.current())
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, []);

  return { refreshing, onRefresh };
}
