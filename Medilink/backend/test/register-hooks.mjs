/**
 * Entry point for `node --import`. Registers the `@/*` resolution hooks (see alias-hooks.mjs)
 * on the loader thread so they apply to every module the test files import.
 *
 * ── NOTE ON `mock.module({ namedExports })` ──
 *
 * The route suites use `namedExports`, which Node 22+ reports as deprecated in favour of
 * `exports`. `namedExports` is used anyway because the pinned `@types/node@^20` does not
 * declare `exports` on `MockModuleOptions`, so switching makes `tsc --noEmit` fail while
 * changing nothing at runtime. Swap it when @types/node is bumped to match the Node version
 * actually used (22+); the deprecation notice is cosmetic until then.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL(import.meta.filename));
