import React, { useEffect } from "react";

import { repositories } from "@/data";
import { getRememberSession } from "@/lib/authPersistence";
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
