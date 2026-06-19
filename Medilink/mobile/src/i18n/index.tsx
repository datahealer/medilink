import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { I18nManager } from "react-native";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { i18n, SUPPORTED_LOCALES, type Locale } from "@medilink/shared/mobile";

type Dir = "ltr" | "rtl";
type MessageId = Parameters<typeof i18n.translate>[1];

interface I18nContextValue {
  locale: Locale;
  dir: Dir;
  setLocale: (locale: Locale) => void;
  t: (id: MessageId) => string;
}

const STORAGE_KEY = "medilink.locale";
const CATALOGS = { en: i18n.en, ar: i18n.ar } as const;
const I18nContext = createContext<I18nContextValue | null>(null);

function dirFor(locale: Locale): Dir {
  return locale === "ar" ? "rtl" : "ltr";
}

function deviceDefault(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode ?? "en";
  return tag === "ar" ? "ar" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceDefault());

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
        applyLocale(stored as Locale, setLocaleState);
      } else {
        applyLocale(deviceDefault(), setLocaleState);
      }
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    void SecureStore.setItemAsync(STORAGE_KEY, next);
    applyLocale(next, setLocaleState);
  }, []);

  const t = useCallback(
    (id: MessageId) => i18n.translateFromMessages(CATALOGS[locale], CATALOGS.en, id),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: dirFor(locale), setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Align React Native's layout direction with the locale. forceRTL only takes full
 * effect after a reload, so callers that switch language should prompt a restart.
 */
function applyLocale(next: Locale, set: (l: Locale) => void) {
  const rtl = next === "ar";
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
  set(next);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
