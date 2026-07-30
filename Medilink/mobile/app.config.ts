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
 *
 * ── RELEASE ASSET RATIONALE ──
 *
 * Every asset referenced from app.json already existed under `assets/`; nothing was
 * generated, and no placeholder was invented. Each choice was made after actually looking
 * at the image, because dimensions alone do not tell you whether a mask will crop a logo.
 *
 * `android.adaptiveIcon.foregroundImage` = assets/images/icon.png (1024x1024, opaque).
 *   Android masks the foreground layer to a circle/squircle, so the logo has to sit inside
 *   the centre ~66% "safe zone" or it gets clipped. In icon.png the "Me" mark spans roughly
 *   the centre 60% horizontally and 41% vertically, so it survives the mask intact.
 *   assets/brand/me-mark.png was the tempting alternative — it is already white-on-
 *   transparent, which is the textbook foreground format — but it is 1363x926, so scaling
 *   it into a square would push the M and e almost to the edges and the mask would clip
 *   them. Known cosmetic limitation of using icon.png: because its violet background is
 *   baked in rather than supplied by `backgroundColor`, Android cannot parallax the logo
 *   independently of the background. A designer-produced transparent square foreground
 *   would fix that; it is polish, not a defect.
 *
 * `expo-notifications.icon` = assets/brand/me-mark.png.
 *   Android ignores the colours in a notification icon entirely: it takes the ALPHA channel,
 *   renders it white and tints it with `color`. me-mark.png is exactly that — an opaque
 *   white mark on transparency. Without this set, Android falls back to the app icon, and
 *   because icon.png is a fully opaque square its alpha channel is a solid block, which is
 *   precisely why notifications currently show a white square. The mark is not square, so
 *   it is letterboxed inside the density buckets and renders a little small — legible and
 *   correct, but a square monochrome variant would look better.
 *
 * `expo-splash-screen` image = assets/brand/me-mark.png on #2E1A47.
 *   Same colour the root layout already paints while fonts load
 *   (`app/_layout.tsx` → backgroundColor "#2E1A47"), so the splash hands over to the first
 *   frame with no flash. `resizeMode: "contain"` with `imageWidth: 200` keeps the
 *   non-square mark undistorted.
 */
assertProductionEnv(process.env);

const config: ExpoConfig = appJson.expo as unknown as ExpoConfig;

export default config;
