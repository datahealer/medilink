import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { I18nManager } from "react-native";

import { useLocaleStore, type Locale } from "@/stores/localeStore";
import { localizeDigits } from "@/utils/format";
import { en, type Messages } from "./en";
import { ar } from "./ar";

const CATALOGS: Record<Locale, Messages> = { en, ar };

/** Dot-path keys into the message catalog, e.g. "signIn.submit". */
type Leaves<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? `${K}.${Leaves<T[K]>}` : K }[keyof T & string]
  : never;
export type MessageKey = Leaves<Messages>;

type Dir = "ltr" | "rtl";

interface I18nContextValue {
  locale: Locale;
  dir: Dir;
  isRTL: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Localize raw numbers/digit-bearing strings (Eastern-Arabic in `ar`). */
  num: (value: string | number) => string;
  /** Persists the locale + aligns native RTL. Returns `true` if a restart is needed. */
  setLocale: (locale: Locale) => boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(catalog: Messages, key: string): string {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalog) as string | undefined ?? key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * Aligns React Native's native layout direction with the locale. `forceRTL` only
 * takes full effect after a reload, so callers switching language must prompt a
 * restart. Returns whether the direction actually changed.
 */
function applyRtl(locale: Locale): boolean {
  const shouldBeRTL = locale === "ar";
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    return true;
  }
  return false;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  const setStoreLocale = useLocaleStore((s) => s.setLocale);

  // Keep the native RTL flag aligned with the persisted locale on launch.
  useEffect(() => {
    applyRtl(locale);
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale): boolean => {
      setStoreLocale(next);
      return applyRtl(next);
    },
    [setStoreLocale]
  );

  const t = useCallback<I18nContextValue["t"]>(
    (key, vars) => localizeDigits(interpolate(resolve(CATALOGS[locale], key), vars), locale),
    [locale]
  );

  const num = useCallback((value: string | number) => localizeDigits(value, locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      isRTL: locale === "ar",
      t,
      num,
      setLocale,
    }),
    [locale, t, num, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
