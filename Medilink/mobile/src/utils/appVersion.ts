import Constants from "expo-constants";

/**
 * User-facing app version for Settings → About (QA MED-022).
 *
 * WHY expo-constants AND NOT expo-application. `Constants.expoConfig.version` is the
 * `expo.version` field already declared in app.json ("1.0.0") and is resolved at build time,
 * so it is correct on both platforms with NO new native dependency and no rebuild of the
 * native project. `expo-application.nativeApplicationVersion` would read the same string
 * from the native bundle but is not currently a dependency, and adding one to render a
 * label is not a trade worth making.
 *
 * BUILD NUMBER DELIBERATELY EXCLUDED. Per the product decision, About shows the marketing
 * version only — "1.0.0" on iOS and Android alike. The build number (iOS `buildNumber` /
 * Android `versionCode`) is intentionally NOT surfaced: eas.json sets
 * `appVersionSource: "remote"`, so the build number is assigned by EAS at build time and is
 * NOT present in app.json. Reading it would therefore require expo-application, and a
 * partially-correct "1.0.0 (unknown)" is worse than the version alone. Crash reports already
 * carry the full build identity via `Constants.expoConfig.version` plus Sentry's native
 * release/dist (see services/reporting).
 *
 * Returns `null` rather than a placeholder when the config is unavailable — the caller hides
 * the row instead of showing an invented version, because a wrong version in a bug report is
 * more expensive than a missing one.
 */
export function getAppVersion(): string | null {
  const version = Constants.expoConfig?.version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}
