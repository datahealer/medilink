// Shared, non-secret config & constants.
export const APP_NAME = "MediLink";
export const SUPPORTED_LOCALES = ["en", "ar"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export * from "./clinicTypes";
export * as i18n from "./i18n/index";
