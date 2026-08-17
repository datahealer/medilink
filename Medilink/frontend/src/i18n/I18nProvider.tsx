"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { i18n, type Locale } from "@medilink/shared";
import {
  DEFAULT_LOCALE,
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Dir,
  dirFor,
  normalizeLocale,
} from "./locale";

type MessageId = Parameters<typeof i18n.translate>[1];

interface I18nContextValue {
  locale: Locale;
  dir: Dir;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (id: MessageId) => string;
}

const CATALOGS = { en: i18n.en, ar: i18n.ar } as const;

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Persist the choice where the SERVER can read it on the next request.
 *
 * `SameSite=Lax` is correct for a preference read on top-level navigation; it is not
 * HttpOnly because this line is the writer. No `Secure` flag is set here on purpose —
 * hardcoding it would break `http://localhost` development, and the deployed app is
 * HTTPS-only anyway, where the browser scopes the cookie to that origin.
 */
function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function readLocaleCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  // Seeded from the server-read cookie, so the first client render matches the SSR output.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  /**
   * ONE-TIME MIGRATION for browsers that chose a language before the cookie existed.
   *
   * Their preference lives in localStorage, which the server cannot see, so the cookie is
   * absent and the server rendered the default. Adopt the stored value once and write the
   * cookie, after which every subsequent request is server-correct and this branch never
   * runs again for that browser.
   *
   * Runs in an effect, not during render: it reads `document` and it INTENTIONALLY changes
   * the locale away from what the server sent. Doing that during the first render is
   * exactly the hydration mismatch this whole change removes — so the mismatched frame is
   * confined to the one legacy visit that needs it, instead of every Arabic page load.
   */
  useEffect(() => {
    if (readLocaleCookie()) return; // Server already had the truth; nothing to migrate.

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
    } catch {
      // Private mode / storage disabled — the cookie default is a fine outcome.
    }
    if (!stored) return;

    const migrated = normalizeLocale(stored);
    writeLocaleCookie(migrated);
    if (migrated !== locale) setLocaleState(migrated);
    // Intentionally mount-only: this is a migration, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Keep `<html lang/dir>` in sync for an IN-SESSION language switch.
   *
   * The server now emits the right values on load, so this no longer fixes the initial
   * paint — it exists for the case where the patient toggles language without a reload.
   */
  useEffect(() => {
    const el = document.documentElement;
    el.lang = locale;
    el.dir = dirFor(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeLocaleCookie(next);
    try {
      // Kept in step so a rollback to the previous build does not lose the choice.
      window.localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the cookie is the source of truth.
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "ar" : "en");
  }, [locale, setLocale]);

  const t = useCallback(
    (id: MessageId) => i18n.translateFromMessages(CATALOGS[locale], CATALOGS.en, id),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: dirFor(locale), setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
