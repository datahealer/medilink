import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";
import { assertProductionEnv } from "./src/config/envGuard.js";

/**
 * Build-time production guard.
 *
 * `app.json` remains the single source of static config — this file only wraps it so the
 * guard runs while Expo RESOLVES the config, which happens during `expo export`,
 * `expo prebuild` and `eas build`. When both files exist Expo prefers this one, and
 * importing `app.json` here keeps the data in one place (a documented Expo pattern).
 *
 * Why the guard cannot live only in `src/config/env.ts`: Metro *bundles* application
 * code, it does not *evaluate* it, so a module-scope throw there is only reached when
 * the app starts — far too late to stop a bad artefact being built and uploaded.
 * Verified empirically: with env vars that make env.ts's `required()` throw,
 * `expo export` still exited 0. Config resolution is the earliest hook that fails the
 * build itself.
 *
 * The guard is plain CommonJS `.js` (with types in `envGuard.d.ts`) because
 * `@expo/config` evaluates this file through a require pipeline that cannot resolve a
 * relative TypeScript import — see the rationale block in `envGuard.js`.
 *
 * ── PERMISSION RATIONALE ──
 *
 * `app.json` is JSON and cannot carry comments, so the reasoning behind its permission
 * config lives here. Verify any change with `npx expo config --type introspect`, which runs
 * every config plugin and reports the resulting `android.permissions` / `ios.infoPlist`.
 *
 * `android.permissions` is deliberately EMPTY. The app declares nothing itself; every
 * permission it ships arrives from a library, which is what makes the Play Data Safety form
 * answerable. Two separate mechanisms feed the final manifest:
 *
 *   1. Config plugins, which write into `android.permissions` — visible in introspect:
 *        • INTERNET, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE  (expo-file-system)
 *      The two storage entries are legacy Android (pre-13) and back document upload and
 *      PDF download/share. Left alone on purpose: they belong to the library, and blocking
 *      them would break file flows on older devices.
 *
 *   2. Library AndroidManifest.xml files, merged by Gradle at BUILD time and therefore NOT
 *      visible in introspect:
 *        • CAMERA                                    (expo-image-picker)
 *        • POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED (expo-notifications)
 *      CAMERA is genuinely used — `records/upload.tsx` calls `launchCameraAsync` to capture
 *      medical documents. It arrives via the library manifest, so `cameraPermission` must
 *      never be set to `false`: that would add it to `blockedPermissions` and break capture.
 *
 * RECORD_AUDIO is refused in two places because one is not enough: it was listed in
 * `android.permissions` AND added independently by expo-image-picker's plugin (which adds it
 * whenever `microphonePermission !== false`, since the picker can record video). Removing
 * only the manifest entry left the plugin to put it straight back. `microphonePermission:
 * false` both blocks it on Android and deletes NSMicrophoneUsageDescription on iOS. Nothing
 * records audio: there is no audio dependency, the library picker requests
 * `mediaTypes: ["images"]`, and `launchCameraAsync` is called with no `mediaTypes`, whose
 * documented default is `'images'`.
 *
 * `faceIDPermission: false` on expo-secure-store is the same shape of problem. That plugin
 * injects NSFaceIDUsageDescription by default, so deleting the string from `ios.infoPlist`
 * alone just swapped our text for the plugin's. Face ID is not used anywhere — no
 * `expo-local-authentication` dependency and no `requireAuthentication` call. NOTE: if
 * SecureStore is ever given `requireAuthentication: true`, this must be changed back to a
 * real string or iOS will fail when Face ID is invoked.
 */
assertProductionEnv(process.env);

const config: ExpoConfig = appJson.expo as unknown as ExpoConfig;

export default config;
