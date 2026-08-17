/**
 * Module-resolution hooks for the backend test runner.
 *
 * ── WHY THIS EXISTS ──
 *
 * `tsconfig.json` maps `@/*` to `src/*`, and every route handler and lib module in this
 * package imports that way. Node's ESM resolver does not read tsconfig `paths`, so before
 * this file existed `node --test` could not import ANY module that used the alias — the
 * import failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`.
 *
 * That is why the existing suites only cover `lib/thawani/checkoutConfig.ts`,
 * `lib/twilio/verifyConfig.ts` and the email modules: those are deliberately written to
 * import nothing from the project ("NOTHING in this file imports another project module, so
 * the Node test runner can load it directly" — checkoutConfig.ts). Keeping a module
 * import-free is a fine discipline for pure config logic, but it is not available to a route
 * handler, which exists precisely to wire other modules together. So the highest-consequence
 * code in the package — the payments surface — had no tests at all, and could not have had
 * any without this hook.
 *
 * ── WHAT IT DOES ──
 *
 * Resolves `@/x` to `<package>/src/x`, adding the `.ts` extension when the specifier omits
 * it (TypeScript source is extensionless by convention; Node requires the real filename).
 * It changes nothing about how the code is compiled or bundled — `next build` and
 * `tsc --noEmit` still use tsconfig `paths` as before. This is test-harness-only.
 *
 * Registered via `node --import ./test/register-hooks.mjs`; see package.json's `test` script.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Split `spec?query#frag` into [`spec`, `?query#frag`]. */
function splitSuffix(specifier) {
  const idx = specifier.search(/[?#]/);
  return idx === -1 ? [specifier, ""] : [specifier.slice(0, idx), specifier.slice(idx)];
}

/** Candidate on-disk filenames for an extensionless TypeScript specifier. */
function candidates(base) {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@" || specifier.startsWith("@/")) {
    /**
     * Split off any `?query` / `#fragment` before touching the filesystem.
     *
     * Route tests cache-bust with `@/app/.../route?t=<random>` so each scenario re-imports
     * the module against freshly-installed `mock.module` stubs — ESM caches by URL, so
     * without a distinct URL every test after the first would silently run against the
     * FIRST test's mocks. The suffix must survive into the resolved URL (that is what makes
     * it a distinct module) but must not be treated as part of the filename.
     */
    const [bare, suffix = ""] = splitSuffix(specifier);
    const relative = bare === "@" ? "" : bare.slice(2);
    const target = path.join(SRC_DIR, relative);

    for (const candidate of candidates(target)) {
      if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
        try {
          // Skip directories that exist but are not the module itself.
          const stat = await import("node:fs").then((fs) => fs.statSync(candidate));
          if (stat.isDirectory()) continue;
        } catch {
          continue;
        }
        return { url: `${pathToFileURL(candidate).href}${suffix}`, shortCircuit: true };
      }
    }

    throw new Error(
      `alias-hooks: could not resolve "${specifier}" — looked for ${candidates(target).join(", ")}`
    );
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || path.extname(specifier)) throw err;

    /**
     * Extensionless specifiers that raw Node ESM cannot resolve but the bundler can.
     * Two distinct cases, one fallback:
     *
     *   • `next/server` — exposed by Next's package exports in a form Node answers with
     *     "Did you mean to import next/server.js?". Retry with `.js`.
     *
     *   • `./types/index` inside `@medilink/shared` — the shared package is consumed as
     *     TypeScript SOURCE (see CLAUDE.md: no build step, Next `transpilePackages` and
     *     Metro aliases handle it), so its internal imports are extensionless TS. Retry
     *     with `.ts` / `/index.ts`.
     *
     * This only ever runs on a specifier that has ALREADY failed, so it cannot mask a
     * genuinely missing module — it just re-asks using the filename Node wants. If every
     * retry also fails, the ORIGINAL error is rethrown, because that one names what the
     * code actually asked for rather than the last thing this hook guessed.
     */
    for (const ext of [".js", ".ts", ".tsx", "/index.ts", "/index.tsx", "/index.js"]) {
      try {
        return await nextResolve(`${specifier}${ext}`, context);
      } catch {
        // try the next candidate
      }
    }
    throw err;
  }
}
