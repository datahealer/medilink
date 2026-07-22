import React, { useEffect } from "react";

import { repositories } from "@/data";
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

    repositories.auth
      .restoreSession()
      .then((user) => {
        if (active) setSession(user);
      })
      .catch(() => {
        if (active) setSession(null);
      });

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
