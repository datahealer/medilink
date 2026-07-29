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
import { reloadApp } from "@/utils/restart";
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
  /** Persist the locale. Direction updates instantly from `isRTL` — no restart. */
  setLocale: (locale: Locale) => void;
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
 * Runtime RTL — keep the NATIVE layout LTR permanently and drive all right-to-left
 * mirroring from the JS `isRTL` context (every screen/component reads it and flips its
 * own `flexDirection`, spacing and text alignment). That lets language + direction
 * switch instantly, with no `forceRTL` and no app restart.
 *
 * This only needs to run once at launch: disallow native RTL, and if a previous build
 * had forced native RTL on, reset it (persists immediately; `reloadApp()` makes the
 * current dev session LTR right away, and production self-heals on the next launch).
 */
function enforceNativeLtr(): void {
  I18nManager.allowRTL(false);
  if (I18nManager.isRTL) {
    I18nManager.forceRTL(false);
    reloadApp();
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  const setStoreLocale = useLocaleStore((s) => s.setLocale);

  // Runtime RTL: keep native layout LTR (once, on launch). Direction is derived from
  // `isRTL` below and re-renders instantly when the locale changes — no native flip.
  useEffect(() => {
    enforceNativeLtr();
  }, []);

  const setLocale = useCallback(
    (next: Locale): void => {
      // Persisting the locale re-renders every consumer with the new `isRTL`, flipping
      // layout direction immediately — no restart, no native forceRTL.
      setStoreLocale(next);
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
