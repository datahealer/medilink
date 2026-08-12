import React, { useEffect } from "react";

import { repositories } from "@/data";
import {
  getRememberSession,
  isFreshInstall,
  markInstalled,
  setRememberedEmail,
} from "@/lib/authPersistence";
import { useAuthStore } from "@/stores/authStore";

/**
 * Bootstraps the session into `authStore` on launch and keeps it in sync — via the
 * active AuthRepository (mock or real, selected by EXPO_PUBLIC_DATA_MODE). The
 * splash screen waits on `authStore.status === "loading"` before routing, so no
 * patient data is shown until the session is confirmed.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    let active = true;

    // This effect runs once per cold JS launch (not on warm background→foreground
    // resumes, which don't remount). So it is the right place to honour "remember
    // me": if the last sign-in opted out, drop the persisted session on launch.
    (async () => {
      try {
        // QA MED-010 — a REINSTALL must land on the sign-in wall. iOS keeps keychain items
        // across app deletion, so a fresh install can inherit a still-valid session from the
        // previous one. This must be checked BEFORE the remember-me branch below: remember-me
        // defaults to "remember" when unset, which is exactly the state a fresh install is in,
        // so it would restore the inherited session instead of clearing it.
        // Rationale for the AsyncStorage sentinel: lib/authPersistence.ts.
        if (await isFreshInstall()) {
          await repositories.auth.signOut().catch(() => {});
          // Also forget the prefill: a reinstall may be a different device owner, and the
          // remembered address is a personal identifier. MED-018's prefill is meant to
          // survive SIGN-OUT, not survive an uninstall.
          await setRememberedEmail(null).catch(() => {});
          // Marked unconditionally: if signOut failed, the in-memory session is still cleared
          // below and the (app) gate sends the user to sign-in, so re-running this on every
          // launch would gain nothing.
          await markInstalled();
          if (active) setSession(null);
          return;
        }

        const remember = await getRememberSession();
        if (!remember) {
          await repositories.auth.signOut().catch(() => {});
          if (active) setSession(null);
          return;
        }
        const user = await repositories.auth.restoreSession();
        if (active) setSession(user);
      } catch {
        if (active) setSession(null);
      }
    })();

    const unsubscribe = repositories.auth.subscribe((user) => {
      if (active) setSession(user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setSession]);

  return <>{children}</>;
}
