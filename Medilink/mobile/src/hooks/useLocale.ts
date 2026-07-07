import { useI18n } from "@/i18n";
import { useLocaleStore, type Locale } from "@/stores/localeStore";

/**
 * Locale hook. Wraps the i18n context + persisted store. `changeLocale` returns
 * whether an app restart is needed (LTR ↔ RTL switch) so the caller can prompt.
 */
export function useLocale() {
  const { locale, dir, isRTL, t, setLocale } = useI18n();
  const hasHydrated = useLocaleStore((s) => s.hasHydrated);

  return {
    locale,
    dir,
    isRTL,
    hasHydrated,
    t,
    /** @returns true when a restart is required to fully apply RTL/LTR. */
    changeLocale: (next: Locale): boolean => setLocale(next),
  };
}
