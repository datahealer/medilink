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
import { i18n, SUPPORTED_LOCALES, type Locale } from "@medilink/shared";

type Dir = "ltr" | "rtl";
type MessageId = Parameters<typeof i18n.translate>[1];

interface I18nContextValue {
  locale: Locale;
  dir: Dir;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (id: MessageId) => string;
}

const STORAGE_KEY = "medilink.locale";
const DEFAULT_LOCALE: Locale = "en";

const CATALOGS = { en: i18n.en, ar: i18n.ar } as const;

const I18nContext = createContext<I18nContextValue | null>(null);

function dirFor(locale: Locale): Dir {
  return locale === "ar" ? "rtl" : "ltr";
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Hydrate from persisted choice on the client.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      setLocaleState(stored as Locale);
    }
  }, []);

  // Keep <html lang/dir> in sync for correct RTL layout + a11y.
  useEffect(() => {
    const el = document.documentElement;
    el.lang = locale;
    el.dir = dirFor(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
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
