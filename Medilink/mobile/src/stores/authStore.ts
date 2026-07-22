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
 */
export type AuthStatus = "loading" | "authed" | "guest";

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  /** Called by AuthProvider whenever the session changes (null = signed out). */
  setSession: (user: SessionUser | null) => void;
  /** Force the loading state (e.g. on manual re-check). */
  setLoading: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  setSession: (user) => set({ user, status: user ? "authed" : "guest" }),
  setLoading: () => set({ status: "loading" }),
}));
