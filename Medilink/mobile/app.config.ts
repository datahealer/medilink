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
 */
assertProductionEnv(process.env);

const config: ExpoConfig = appJson.expo as unknown as ExpoConfig;

export default config;
