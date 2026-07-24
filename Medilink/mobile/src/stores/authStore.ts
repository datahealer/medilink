import { create } from "zustand";
import type { SessionUser } from "@/data/types";

/**
 * Session mirror for navigation/route-guarding. Decoupled from any backend SDK type
 * (uses the domain `SessionUser`). `AuthProvider` drives it from the active
 * AuthRepository (mock or real) so the router has a synchronous status to read.
 *
 *   • status "loading" — still restoring the session on launch (show splash)
 *   • status "authed"  — a valid session exists → (app) routes allowed
 *   • status "guest"   — no session → auth routes only
 *
 * `guestMode` is orthogonal to `status`: it distinguishes "no session AND the user
 * chose to browse as a guest" (allow-listed read-only discovery) from the default
 * "no session → must sign in". It is only meaningful while `status === "guest"` and
 * is always cleared when a real session arrives or the user signs out (F4 Guest Mode).
 */
export type AuthStatus = "loading" | "authed" | "guest";

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  /** True when a signed-out user opted into browse-as-guest (allow-listed routes). */
  guestMode: boolean;
  /** Called by AuthProvider whenever the session changes (null = signed out). */
  setSession: (user: SessionUser | null) => void;
  /** Force the loading state (e.g. on manual re-check). */
  setLoading: () => void;
  /** Opt into guest browsing (signed-out, allow-listed discovery only). */
  continueAsGuest: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  guestMode: false,
  // A real session always exits guest mode. A null session exits guest mode only on a
  // genuine sign-out (previous status "authed") or launch ("loading"); a stray
  // no-session auth event while ALREADY browsing as a guest preserves guest mode so
  // the user isn't bounced to the auth wall mid-browse.
  setSession: (user) =>
    set((s) => ({
      user,
      status: user ? "authed" : "guest",
      guestMode: user ? false : s.status === "guest" ? s.guestMode : false,
    })),
  setLoading: () => set({ status: "loading" }),
  continueAsGuest: () => set({ guestMode: true, status: "guest", user: null }),
}));
