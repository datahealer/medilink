"use client";

/*
 * FavouriteButton — toggles a doctor/clinic favourite via the shared RLS API
 * (api.favourites). Backend + table already exist; this is pure integration.
 * Reusable across doctor cards, doctor profile, and (future) clinic pages.
 */
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { api } from "@medilink/shared";

// Mirrors api.favourites.FavouriteTarget (not re-exported at the package root).
type FavouriteTarget = "doctor" | "facility";
type Size = "sm" | "md";

export function FavouriteButton({
  targetId,
  targetType,
  size = "md",
  className = "",
  initialFavourite,
}: {
  targetId: string;
  targetType: FavouriteTarget;
  size?: Size;
  className?: string;
  /**
   * When provided, seeds the initial state and skips the per-item lookup — use
   * from list views that already loaded the caller's favourites in one query.
   */
  initialFavourite?: boolean;
}) {
  const [fav, setFav] = useState(initialFavourite ?? false);
  const [loading, setLoading] = useState(initialFavourite === undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!targetId || initialFavourite !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const is = await api.favourites.isFavourite(supabase, { targetId, targetType });
        if (!cancelled) setFav(is);
      } catch {
        /* not signed in / RLS — treat as not-favourited */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, targetType, initialFavourite]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const optimistic = !fav;
    setFav(optimistic);
    try {
      const supabase = createBrowserSupabaseClient();
      const next = await api.favourites.toggleFavourite(supabase, { targetId, targetType });
      setFav(next);
    } catch {
      setFav(!optimistic); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  const dim = size === "sm" ? "w-8 h-8 text-lg" : "w-10 h-10 text-xl";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading || busy}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favourites" : "Add to favourites"}
      className={`${dim} rounded-full flex items-center justify-center border transition-all disabled:opacity-50 ${
        fav
          ? "border-transparent bg-rose-50 dark:bg-rose-900/20 text-rose-500"
          : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-rose-500 hover:border-rose-200"
      } ${className}`}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}
