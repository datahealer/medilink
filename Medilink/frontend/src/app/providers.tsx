"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "@/theme/ThemeProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AuthProvider } from "@/context/AuthContext";
import type { Locale } from "@medilink/shared";

/**
 * Single client-side provider tree composed at the app root.
 *
 * `initialLocale` is threaded from the server (root layout reads the locale cookie) rather
 * than defaulted here, so the first client render agrees with the server-rendered HTML.
 */
export function Providers({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  return (
    <ThemeProvider>
      <I18nProvider initialLocale={initialLocale}>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
