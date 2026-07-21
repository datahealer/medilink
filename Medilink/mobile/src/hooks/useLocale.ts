import { useI18n } from "@/i18n";
import { useLocaleStore, type Locale } from "@/stores/localeStore";

/**
 * Locale hook. Wraps the i18n context + persisted store. `changeLocale` switches the
 * language AND layout direction instantly (runtime RTL) — no restart required.
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
    /** Switch language + direction immediately (no restart). */
    changeLocale: (next: Locale): void => setLocale(next),
  };
}
