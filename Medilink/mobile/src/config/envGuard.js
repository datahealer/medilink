/**
 * Production environment guard — ONE rule, three consumers.
 *
 * Consumed by:
 *   1. `app.config.ts`  — via `require`, while Expo resolves the config. This is the
 *      check that actually FAILS A BUILD (`expo export`, `expo prebuild`, `eas build`).
 *   2. `src/config/env.ts` — at app startup, as defence in depth.
 *   3. its Jest suite — the rule is pure, so it is tested directly.
 *
 * WHY THIS EXISTS
 * `EXPO_PUBLIC_DATA_MODE` defaults to "mock" and `EXPO_PUBLIC_APP_ENV` to "development"
 * (see env.ts). Sensible for local work, but together they mean a build produced without
 * environment configuration would serve the seeded in-memory patient ("Aisha Al Harthy")
 * as if it were real, and leave the app/dev/* routes reachable. Both fail SILENTLY — no
 * crash, no warning. Shipping fabricated patient records is the worst outcome this
 * project can produce, so it is made a hard error.
 *
 * WHY PLAIN COMMONJS .js AND NOT .ts
 * `@expo/config` evaluates `app.config.ts` through a `require` pipeline that cannot
 * resolve a relative *TypeScript* import — an earlier attempt failed every build with
 * "Cannot find module './src/config/assertProductionEnv'" regardless of the env values.
 * A `.js` CommonJS module resolves natively for the config evaluator, Metro and node
 * alike, so the rule stays in exactly one place. Types live in `envGuard.d.ts`, which
 * keeps `env.ts` fully typed without needing `allowJs` in tsconfig.
 *
 * Deliberately dependency-free: no imports, no process access, no throwing in the
 * check itself.
 */

/**
 * @param {Record<string, string | undefined>} source
 * @returns {{ APP_ENV?: string, DATA_MODE?: string }}
 */
function readEnvSnapshot(source) {
  return {
    APP_ENV: source.EXPO_PUBLIC_APP_ENV,
    DATA_MODE: source.EXPO_PUBLIC_DATA_MODE,
  };
}

/**
 * Returns an error message when the combination is unsafe to ship, else `null`.
 *
 * Two rules:
 *  1. `APP_ENV=production` REQUIRES `DATA_MODE=production`. A store build must talk to
 *     production — never mock, never staging.
 *  2. Any non-development `APP_ENV` forbids `DATA_MODE=mock`. A staging/preview build
 *     reaches real testers; mock data would waste a whole QA cycle, or worse be mistaken
 *     for real patient data.
 *
 * @param {{ APP_ENV?: string, DATA_MODE?: string }} snapshot
 * @returns {string | null}
 */
function checkProductionEnv(snapshot) {
  const appEnv = (snapshot.APP_ENV == null ? "development" : snapshot.APP_ENV)
    .trim()
    .toLowerCase();
  // Mirrors env.ts exactly: anything unrecognised collapses to "mock". Without this,
  // a typo like DATA_MODE=prod would slip through as mock data in a release build.
  const raw = (snapshot.DATA_MODE == null ? "mock" : snapshot.DATA_MODE).trim().toLowerCase();
  const dataMode = raw === "staging" || raw === "production" ? raw : "mock";

  if (appEnv === "production" && dataMode !== "production") {
    return (
      'Refusing to build: EXPO_PUBLIC_APP_ENV="production" but EXPO_PUBLIC_DATA_MODE="' +
      dataMode +
      '". A production build must use DATA_MODE=production — "mock" ships seeded fake ' +
      'patient data and "staging" points release users at the staging backend. ' +
      "Set EXPO_PUBLIC_DATA_MODE=production (see eas.json)."
    );
  }

  if (appEnv !== "development" && dataMode === "mock") {
    return (
      'Refusing to build: EXPO_PUBLIC_APP_ENV="' +
      appEnv +
      '" with EXPO_PUBLIC_DATA_MODE="mock". Builds that reach testers must not use mock ' +
      'data. Set EXPO_PUBLIC_DATA_MODE to "staging" or "production" (see eas.json).'
    );
  }

  return null;
}

/**
 * Throws when the environment is unsafe to ship. Used by the build-time and runtime guards.
 * @param {Record<string, string | undefined>} source
 * @returns {void}
 */
function assertProductionEnv(source) {
  const problem = checkProductionEnv(readEnvSnapshot(source));
  if (problem) throw new Error(problem);
}

module.exports = { readEnvSnapshot, checkProductionEnv, assertProductionEnv };
