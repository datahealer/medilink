"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "@/theme/ThemeProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AuthProvider } from "@/context/AuthContext";

/** Single client-side provider tree composed at the app root. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
