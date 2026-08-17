import { SUPPORTED_LOCALES, type Locale } from "@medilink/shared";

/**
 * Locale primitives shared by the SERVER (root layout) and the CLIENT (I18nProvider).
 *
 * Deliberately has no "use client" directive and imports nothing browser-only, so the root
 * layout — a Server Component — can use it to emit `<html lang dir>` during SSR.
 *
 * ── WHY THE LOCALE MOVED FROM localStorage TO A COOKIE ──
 *
 * It used to live only in `localStorage`, which the server cannot read. The consequences
 * were not cosmetic:
 *
 *   1. Every server render emitted `<html lang="en" dir="ltr">`, unconditionally. An Arabic
 *      patient's first paint was English and left-to-right; the direction only flipped once
 *      `I18nProvider`'s effect ran after hydration. That is a full-page layout jump on every
 *      navigation that hits the server, and it happened on the login and dashboard routes an
 *      Arabic user sees most.
 *   2. With JavaScript unavailable or still loading, the page STAYED left-to-right. Arabic
 *      text in an LTR document renders with punctuation and mixed-direction runs in the
 *      wrong places — not merely unstyled, but genuinely harder to read.
 *   3. Crawlers and assistive technology read `lang="en"` for Arabic content. A screen
 *      reader announcing Arabic with an English voice is the accessibility failure this
 *      attribute exists to prevent.
 *
 * A cookie is sent with the document request, so the server knows the locale BEFORE it
 * renders. The trade-off is real and is documented at the `cookies()` call in the layout:
 * reading it opts the route tree out of static prerendering.
 *
 * The cookie is NOT HttpOnly on purpose — the client must be able to write it when the
 * patient switches language. It carries a UI preference, never anything sensitive, so a
 * readable cookie costs nothing.
 */

export type Dir = "ltr" | "rtl";

/** Cookie name. Matches the old localStorage key so the migration path reads naturally. */
export const LOCALE_COOKIE = "medilink.locale";

/** Legacy localStorage key, still read once per browser to migrate an existing choice. */
export const LEGACY_LOCALE_STORAGE_KEY = "medilink.locale";

export const DEFAULT_LOCALE: Locale = "en";

/** One year. A language preference has no reason to expire sooner. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function dirFor(locale: Locale): Dir {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * Coerce an untrusted value (cookie, localStorage, query param) to a supported locale.
 *
 * A cookie is user-controlled input. It reaches `<html lang>` and `dir`, so anything not on
 * the allow-list must collapse to the default rather than be echoed into the document.
 */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const trimmed = value.trim().toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(trimmed)
    ? (trimmed as Locale)
    : DEFAULT_LOCALE;
}
