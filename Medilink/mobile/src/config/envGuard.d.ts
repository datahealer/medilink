/**
 * Types for `envGuard.js`. Hand-written so `env.ts` and the Jest suite stay fully typed
 * without enabling `allowJs` in tsconfig — see the comment block in envGuard.js for why
 * the implementation must be plain CommonJS.
 */

export interface EnvSnapshot {
  APP_ENV?: string;
  DATA_MODE?: string;
}

/** Picks only the two variables the guard depends on from any env-like object. */
export function readEnvSnapshot(source: Record<string, string | undefined>): EnvSnapshot;

/** Error message when the combination is unsafe to ship, otherwise `null`. */
export function checkProductionEnv(snapshot: EnvSnapshot): string | null;

/** Throws when the environment is unsafe to ship. */
export function assertProductionEnv(source: Record<string, string | undefined>): void;
