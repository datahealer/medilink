/**
 * Module-resolution hooks for the frontend test runner.
 *
 * ── WHY THIS EXISTS ──
 *
 * This workspace had NO test runner at all until now — `package.json` went straight from
 * `lint` to `typecheck`, so every piece of pure logic in `src/lib/` was unverified. Adding
 * one runs into the same wall the backend hit: `tsconfig.json` maps `@/*` to `src/*` and the
 * whole codebase imports that way, but Node's ESM resolver does not read tsconfig `paths`,
 * so `import { … } from "@/lib/supportContact"` fails with
 * `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`.
 *
 * Node also will not resolve an extensionless RELATIVE import (`../supportContact`) to a
 * `.ts` file — TypeScript source is extensionless by convention, Node wants the real
 * filename. So without a hook the only importable form would be `../supportContact.ts`,
 * which needs `allowImportingTsExtensions` turned on for the entire workspace. A
 * test-harness-only resolver is the smaller change: it leaves both the compiler options and
 * the app's import conventions exactly as they were.
 *
 * This is the sibling of `backend/test/alias-hooks.mjs`, deliberately kept simpler — it has
 * no `?query` cache-busting (no suite here uses `mock.module`) and no bundler-only-specifier
 * fallbacks. Grow it from that file if a future suite needs them.
 *
 * Nothing about the build changes: `next build` and `tsc --noEmit` still use tsconfig
 * `paths`. Registered via `node --import ./test/register-hooks.mjs`; see the `test` script.
 */
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Candidate on-disk filenames for an extensionless TypeScript specifier. */
function candidates(base) {
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
}

function resolveFile(target) {
  for (const candidate of candidates(target)) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      // unreadable path — treat as absent and keep looking
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@" || specifier.startsWith("@/")) {
    const relative = specifier === "@" ? "" : specifier.slice(2);
    const hit = resolveFile(path.join(SRC_DIR, relative));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    throw new Error(
      `alias-hooks: could not resolve "${specifier}" — looked for ` +
        candidates(path.join(SRC_DIR, relative)).join(", ")
    );
  }

  // Relative imports between TypeScript source files, which the app writes extensionless.
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const hit = resolveFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
