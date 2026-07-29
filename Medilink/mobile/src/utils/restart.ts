import { DevSettings } from "react-native";

/**
 * Whether the app can reload itself programmatically in the current build.
 *
 * React Native's `DevSettings.reload()` only exists (and only recreates the native
 * root view) in a dev/debug build — which is what the Expo dev client is. A
 * production/release build has no JS-only full-restart primitive; that would need a
 * native reload module such as `expo-updates` (`Updates.reloadAsync()`). Until that
 * is added, production must fall back to asking the user to relaunch manually.
 */
export const canReloadApp: boolean =
  __DEV__ && typeof (DevSettings as { reload?: unknown })?.reload === "function";

/**
 * Reloads the app so a pending `I18nManager.forceRTL()` layout-direction change takes
 * full effect — RN only applies an LTR↔RTL flip once the native root view is recreated.
 *
 * @returns `true` if a reload was triggered, `false` if the caller must instead ask the
 *          user to relaunch the app manually (production build without a reload module).
 */
export function reloadApp(): boolean {
  if (!canReloadApp) return false;
  DevSettings.reload();
  return true;
}
