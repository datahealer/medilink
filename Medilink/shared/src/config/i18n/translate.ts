import type { Locale, MessageId } from "./types";
import { messages as enMessages } from "./en";
import { messages as arMessages } from "./ar";

type Messages = Record<string, unknown>;

const catalogs: Record<Locale, Messages> = {
  en: enMessages as Messages,
  ar: arMessages as Messages,
};

/** Returns the (already-bundled) message catalog for a locale; falls back to en. */
export async function loadLocale(locale: Locale): Promise<Messages> {
  return catalogs[locale] ?? catalogs.en;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function translateFromMessages(messages: Messages, fallback: Messages, id: MessageId): string {
  const localized = getByPath(messages, id);
  if (typeof localized === "string") return localized;

  const fb = getByPath(fallback, id);
  if (typeof fb === "string") return fb;

  return id;
}

/** Synchronous translate against the bundled catalogs (server or static usage). */
export function translate(locale: Locale, id: MessageId): string {
  const dict = locale === "ar" ? arMessages : enMessages;
  return translateFromMessages(dict as Messages, enMessages as Messages, id);
}
